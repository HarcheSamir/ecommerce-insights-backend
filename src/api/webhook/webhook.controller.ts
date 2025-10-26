// File: ./src/api/webhook/webhook.controller.ts
// CORRECTED VERSION - with the 'export' keyword restored.

import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

// 1️⃣ Initialize Prisma
const prisma = new PrismaClient();

// 2️⃣ Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const AFFILIATE_COMMISSION_RATE = 0.20; // 20%

// --- CORRECTION: The 'export' keyword was missing. It is now restored. ---
export const webhookController = {
  async stripeWebhook (req: Request, res: Response) {
    const sig = req.headers["stripe-signature"];

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body, // raw body, not JSON-parsed
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );
    } catch (err: any) {
      console.error("⚠️ Webhook signature verification failed.", err.message);
      return res.status(400).json({
        message: `Webhook Error: ${err.message}`
      });
    }

    switch (event.type) {
    case "payment_intent.created": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await prisma.transaction.updateMany({
        where: { stripeInvoiceId: paymentIntent.id },
        data: { status: "created" },
        });
        break;
    }

    case "payment_intent.processing": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await prisma.transaction.updateMany({
        where: { stripeInvoiceId: paymentIntent.id },
        data: { status: "processing" },
        });
        break;
    }

    case "payment_intent.requires_action": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await prisma.transaction.updateMany({
        where: { stripeInvoiceId: paymentIntent.id },
        data: { status: "requires_action" },
        });
        break;
    }

    case "payment_intent.canceled": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await prisma.transaction.updateMany({
        where: { stripeInvoiceId: paymentIntent.id },
        data: { status: "canceled" },
        });
        break;
    }

    case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        // Step 1: Update the transaction status using updateMany
        await prisma.transaction.updateMany({
            where: { stripeInvoiceId: paymentIntent.id },
            data: { status: "succeeded" },
        });

        // Step 2: Find the transaction we just updated to get its details and related user
        const transaction = await prisma.transaction.findFirst({
            where: { stripeInvoiceId: paymentIntent.id },
            include: { user: true } // Include the user data
        });

        // Step 3: Check if the user who paid was referred and create commission
        if (transaction && transaction.user && transaction.user.referredById) {
            const affiliateId = transaction.user.referredById;
            const commissionAmount = transaction.amount * AFFILIATE_COMMISSION_RATE;

            // Ensure a commission for this transaction doesn't already exist
            const existingCommission = await prisma.commission.findUnique({
                where: { sourceTransactionId: transaction.id }
            });

            if (!existingCommission) {
                try {
                    await prisma.commission.create({
                        data: {
                            amount: commissionAmount,
                            affiliateId: affiliateId,
                            sourceTransactionId: transaction.id
                        }
                    });
                    console.log(`Successfully created commission of ${commissionAmount} for affiliate ${affiliateId}.`);
                } catch (error) {
                    console.error(`Failed to create commission for transaction ${transaction.id}:`, error);
                }
            }
        }
        break;
    }

    case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await prisma.transaction.updateMany({
        where: { stripeInvoiceId: paymentIntent.id },
        data: { status: "failed" },
        });
        break;
    }

    default: {
        console.log(`Unhandled event type ${event.type}`);
        break;
    }
    }

    res.status(200).json({
      message: `Webhook received`
    });
  }
};