// In ./src/api/payment/payment.controller.ts

import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { AuthenticatedRequest } from "../../utils/AuthRequestType";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export const paymentController = {

  

  // --- NEW FUNCTION FOR EMBEDDED SUBSCRIPTION FORM ---
  async createSubscription(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.userId;
    const { priceId, paymentMethodId } = req.body;

    if (!priceId || !paymentMethodId) {
      return res.status(400).json({ error: 'priceId and paymentMethodId are required.' });
    }

    try {
      let user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      let stripeCustomerId = user.stripeCustomerId;

      // --- THIS IS THE FIX ---
      // If the user does not have a Stripe Customer ID, create one.
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        });
        stripeCustomerId = customer.id;

        // Save the new ID to the user in our database
        user = await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: stripeCustomerId },
        });
      }
      // --- END OF FIX ---

      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId,
      });

      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        expand: ["latest_invoice.payment_intent"],
      });

      const latestInvoice = subscription.latest_invoice as any;
      const paymentIntent = latestInvoice.payment_intent as Stripe.PaymentIntent;

      if (paymentIntent && paymentIntent.status === 'requires_action') {
        res.status(200).json({
          status: 'requires_action',
          clientSecret: paymentIntent.client_secret,
          subscriptionId: subscription.id
        });
      } else if (subscription.status === 'active') {
        res.status(200).json({ status: 'active', subscriptionId: subscription.id });
      } else {
        res.status(400).json({ status: subscription.status, error: 'Subscription failed to activate.' });
      }
    } catch (error: any) {
      console.error("Stripe subscription creation failed:", error);
      res.status(500).json({ error: 'Failed to create subscription.' });
    }
  },


  async createCoursePaymentIntent(req: AuthenticatedRequest, res: Response) {
    const { courseId } = req.body;
    const userId = req.user!.userId;

    try {
      const course = await prisma.videoCourse.findUnique({ where: { id: courseId } });
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!course || !course.price || course.price <= 0) {
        return res.status(404).json({ error: 'Course not found or is not for sale.' });
      }
      if (!user || !user.stripeCustomerId) {
        return res.status(404).json({ error: 'Stripe customer not found.' });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(course.price * 100),
        currency: 'eur',
        customer: user.stripeCustomerId,
        metadata: {
            userId: userId,
            courseId: course.id,
            purchasePrice: course.price.toString(),
        }
      });

      res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
        console.error("Course Payment Intent creation failed:", error);
        res.status(500).json({ error: 'Failed to create Payment Intent.' });
    }
  },


  
  async getProductsAndPrices(req: AuthenticatedRequest, res: Response) {
    try {
      const prices = await stripe.prices.list({
        active: true,
        expand: ['data.product'],
      });

      const latestPrices = new Map<string, Stripe.Price>();

      for (const price of prices.data) {
        const product = price.product;

        // --- SURGICAL FIX START ---
        // This block now correctly and safely handles all possible types for `price.product`.
        if (typeof product !== 'object' || product === null) {
          // Skip if product is not an expanded object (e.g., just an ID string)
          continue;
        }

        if ('deleted' in product && product.deleted) {
          // Skip if the product is an expanded, but deleted, product object.
          continue;
        }
        // At this point, TypeScript knows `product` is a valid `Stripe.Product` object.
        // --- SURGICAL FIX END ---

        const interval = price.recurring?.interval ?? 'one-time';
        const key = `${product.id}-${interval}`;
        const existingPrice = latestPrices.get(key);

        if (!existingPrice || price.created > existingPrice.created) {
          latestPrices.set(key, price);
        }
      }

      const uniqueLatestPrices = Array.from(latestPrices.values());

      const formattedPrices = uniqueLatestPrices.map(price => {
        const product = price.product as Stripe.Product; // This cast is now safe
        return {
          id: price.id,
          name: product.name,
          description: product.description,
          price: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval,
        };
      });

      res.status(200).json(formattedPrices);
    } catch (error: any) {
      console.error("Failed to fetch products and prices from Stripe:", error);
      res.status(500).json({ error: 'Failed to fetch subscription plans.' });
    }
  },
};