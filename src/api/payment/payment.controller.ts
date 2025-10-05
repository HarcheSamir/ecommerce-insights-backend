import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { AuthenticatedRequest } from "../../utils/AuthRequestType";

// 1️⃣ Initialize Prisma
const prisma = new PrismaClient();

// 2️⃣ Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export const paymentController = {
  async createPaymentIntent(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // 1️⃣ Get the user
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "User not found" });

      // 2️⃣ Ensure Stripe customer exists
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        });
        customerId = customer.id;

        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      // 3️⃣ Create PaymentIntent for €49.99
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(49.00 * 100), // 4999 cents
        currency: "eur",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: { userId },
      });

      // 4️⃣ Save a pending transaction
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          amount: 49.00,
          currency: "eur",
          status: "pending",
          stripeInvoiceId: paymentIntent.id, // store PaymentIntent id
        },
      });

      // 5️⃣ Return client_secret to frontend
      res.json({ 
        Message: "Payment Intent created successfully",
        clientSecret: paymentIntent.client_secret, 
        transaction 
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
};
