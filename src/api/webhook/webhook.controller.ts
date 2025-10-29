// In ./src/api/webhook/webhook.controller.ts

import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const AFFILIATE_COMMISSION_RATE = 0.20; // 20%

export const webhookController = {
  async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers["stripe-signature"];
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );
    } catch (err: any) {
      console.error("⚠️ Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      // THIS IS YOUR WORKING CODE FOR SUBSCRIPTIONS. IT IS UNTOUCHED.
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (!user) {
          console.error(`Webhook Error: User not found for customer ID ${customerId}`);
          break;
        }

        const transaction = await prisma.transaction.create({
          data: {
            userId: user.id,
            amount: invoice.amount_paid / 100.0,
            currency: invoice.currency,
            status: 'succeeded',
            stripeInvoiceId: invoice.id,
          },
        });
        console.log(`--- Transaction record created for user ${user.id} ---`);

        if (user.referredById) {
          const commissionAmount = transaction.amount * AFFILIATE_COMMISSION_RATE;
          await prisma.commission.create({
            data: {
              amount: commissionAmount,
              affiliateId: user.referredById,
              sourceTransactionId: transaction.id,
            }
          });
          console.log(`--- Commission of ${commissionAmount} created for referrer ${user.referredById} ---`);
        }
        
        let subscriptionId = invoice.subscription;
        if (!subscriptionId && invoice.lines?.data[0]?.parent?.type === 'subscription_item_details') {
          subscriptionId = invoice.lines.data[0].parent.subscription_item_details.subscription;
        }

        if (!subscriptionId) {
            console.log(`Webhook Info: Ignoring invoice ${invoice.id} because it is not a subscription payment.`);
            break;
        }

        const periodEndTimestamp = invoice.lines.data[0].period.end;
        
        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: 'ACTIVE',
            currentPeriodEnd: new Date(periodEndTimestamp * 1000),
          },
        });
        console.log(`--- SUCCESS: User subscription is now ACTIVE for customer ${customerId} ---`);
        break;
      }
      
      // --- THIS IS THE NEW, CORRECT HANDLER FOR COURSE PURCHASES ---
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as any;

        // Check if this payment intent was for a course purchase
        if (paymentIntent.metadata?.courseId) {
            const { userId, courseId, purchasePrice } = paymentIntent.metadata;

            if (!userId || !courseId || !purchasePrice) {
                console.error(`Webhook Error: Missing metadata in payment_intent ${paymentIntent.id}`);
                break;
            }

            // Create the purchase record to grant access
            await prisma.coursePurchase.create({
                data: {
                    userId: userId,
                    courseId: courseId,
                    purchasePrice: parseFloat(purchasePrice),
                },
            });
            console.log(`--- Course ${courseId} purchased by user ${userId} ---`);

            // Optionally, create a transaction record for consistency
            await prisma.transaction.create({
              data: {
                userId: userId,
                amount: paymentIntent.amount / 100.0,
                currency: paymentIntent.currency,
                status: 'succeeded',
                stripeInvoiceId: paymentIntent.id, // Using the PI id as the reference
              },
            });
        }
        break;
      }

      // --- THE REST OF YOUR WORKING CODE IS UNTOUCHED. ---
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            subscriptionStatus: subscription.status.toUpperCase(),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        });
        console.log(`--- Subscription ${subscription.id} updated to status ${subscription.status.toUpperCase()} ---`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { subscriptionStatus: 'CANCELED' },
        });
        console.log(`--- Subscription ${subscription.id} was deleted/canceled ---`);
        break;
      }
      
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
};