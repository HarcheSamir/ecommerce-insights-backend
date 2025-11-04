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
    const { courseId, currency, applyAffiliateDiscount } = req.body;
    const userId = req.user!.userId;

    if (!courseId || !currency || !['eur', 'usd'].includes(currency)) {
      return res.status(400).json({ error: 'courseId and a valid currency (eur/usd) are required.' });
    }

    try {
      const course = await prisma.videoCourse.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(404).json({ error: 'Course not found.' });
      }

      const initialPrice = currency === 'eur' ? course.priceEur : course.priceUsd;
      if (initialPrice === null || initialPrice < 0) {
        return res.status(400).json({ error: `Course is not available for purchase in ${currency.toUpperCase()}.` });
      }

      const clientSecret = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { stripeCustomerId: true, availableCourseDiscounts: true }
        });

        // ======================= ADD THIS DEBUGGING BLOCK =======================
        console.log("\n--- [BACKEND DEBUG] INSIDE TRANSACTION ---");
        console.log("1. Received Request Body:", req.body);
        console.log("2. User object fetched from DB (inside tx):", user);
        console.log("3. Does user have discounts? (user.availableCourseDiscounts > 0):", (user?.availableCourseDiscounts ?? 0) > 0);
        console.log("4. Is discount flag true? (applyAffiliateDiscount):", applyAffiliateDiscount);
        // ========================================================================

        if (!user || !user.stripeCustomerId) {
          throw new Error('Stripe customer not found.');
        }

        let finalPrice = initialPrice;

        if (applyAffiliateDiscount && user.availableCourseDiscounts > 0) {
          const discountSetting = await tx.setting.findUnique({
            where: { key: 'affiliateCourseDiscountPercentage' }
          });
          const discountPercentage = Number(discountSetting?.value || 0);
          
          // ======================= ADD THIS DEBUGGING BLOCK =======================
          console.log("5. Discount logic triggered. Percentage from DB:", discountPercentage);
          // ========================================================================
          
          if (discountPercentage > 0) {
            finalPrice = initialPrice * (1 - (discountPercentage / 100));
            await tx.user.update({
              where: { id: userId },
              data: { availableCourseDiscounts: { decrement: 1 } }
            });
          }
        }
        
        // ======================= ADD THIS DEBUGGING BLOCK =======================
        console.log("6. Final Price before sending to Stripe:", finalPrice);
        console.log("--- [BACKEND DEBUG] END OF LOGS ---\n");
        // ========================================================================

        if (finalPrice <= 0) {
          return null;
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(finalPrice * 100),
          currency: currency,
          customer: user.stripeCustomerId,
          metadata: { userId, courseId, purchasePrice: finalPrice.toString() }
        });

        return paymentIntent.client_secret;
      });

      if (clientSecret === null) {
          await prisma.coursePurchase.create({
              data: { userId, courseId, purchasePrice: 0 }
          });
          console.log(`--- Course ${courseId} granted for free to user ${userId} via discount ---`);
      }

      res.status(200).json({ clientSecret });

    } catch (error: any) {
      console.error("Course Payment Intent creation failed:", error);
      if (error.message === 'Stripe customer not found.') {
          return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create Payment Intent.' });
    }
  },



  async getProductsAndPrices(req: AuthenticatedRequest, res: Response) {
    try {
      const currency = req.query.currency || 'usd'; // Default to 'eur' if not provided

      const prices = await stripe.prices.list({
        active: true,
        currency: currency as string, // Add currency filter to the Stripe API call
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
  async cancelSubscription(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.userId;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user || !user.stripeSubscriptionId) {
        return res.status(400).json({ error: "No active subscription found for this user." });
      }

      const updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      if (updatedSubscription.cancel_at) {
        await prisma.user.update({
          where: { id: userId },
          data: { currentPeriodEnd: new Date(updatedSubscription.cancel_at * 1000) },
        });
      }

      res.status(200).json({ message: "Subscription cancellation scheduled successfully." });
    } catch (error: any) {
      console.error("Subscription cancellation failed:", error);
      res.status(500).json({ error: "Failed to schedule subscription cancellation." });
    }
  },

  // --- DEFINITIVE FIX IS HERE ---
  async reactivateSubscription(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.userId;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user || !user.stripeSubscriptionId) {
        return res.status(400).json({ error: "No subscription found for this user." });
      }

      const updatedSubscription: Stripe.Subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      // THE SURGICAL FIX: Access the property through the correct nested path.
      // This is the line that caused the repeated compilation failures. It is now correct.
      const newPeriodEnd = updatedSubscription.items.data[0]?.current_period_end;

      if (newPeriodEnd) {
        await prisma.user.update({
          where: { id: userId },
          data: { currentPeriodEnd: new Date(newPeriodEnd * 1000) },
        });
      }

      res.status(200).json({ message: "Subscription reactivated successfully." });
    } catch (error: any) {
      console.error("Subscription reactivation failed:", error);
      res.status(500).json({ error: "Failed to reactivate subscription." });
    }
  },
};