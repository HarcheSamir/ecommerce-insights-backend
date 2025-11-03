//  ./src/api/webhook/webhook.controller.ts

import { Request, Response } from "express";
import { PrismaClient, SubscriptionStatus } from "@prisma/client"; // --- FIX: IMPORT ENUM ---
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);


const mapStripeStatusToPrismaStatus = (stripeStatus: string): SubscriptionStatus => {
  const statusMap: { [key: string]: SubscriptionStatus } = {
    'trialing': SubscriptionStatus.TRIALING,
    'active': SubscriptionStatus.ACTIVE,
    'past_due': SubscriptionStatus.PAST_DUE,
    'canceled': SubscriptionStatus.CANCELED,
    'incomplete': SubscriptionStatus.INCOMPLETE,
    'incomplete_expired': SubscriptionStatus.CANCELED, // <-- FIX IS HERE
    'unpaid': SubscriptionStatus.CANCELED, // Or PAST_DUE, depending on your business logic
  };

  return statusMap[stripeStatus] || SubscriptionStatus.INCOMPLETE; // Default fallback
}


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
          const previousTransactions = await prisma.transaction.count({
            where: { userId: user.id, status: 'succeeded' }
          });

          if (previousTransactions <= 1) {
            const commissionRateSetting = await prisma.setting.findUnique({
              where: { key: 'affiliateCommissionRate' },
            });
            const commissionRate = commissionRateSetting ? parseFloat(commissionRateSetting.value) / 100 : 0.20;
            const commissionAmount = transaction.amount * commissionRate;

            await prisma.commission.create({
              data: {
                amount: commissionAmount,
                affiliateId: user.referredById,
                sourceTransactionId: transaction.id,
              }
            });
            console.log(`--- Commission of ${commissionAmount} created for referrer ${user.referredById} ---`);
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as any;

        if (paymentIntent.metadata?.courseId) {
            const { userId, courseId, purchasePrice } = paymentIntent.metadata;

            if (!userId || !courseId || !purchasePrice) {
                console.error(`Webhook Error: Missing metadata in payment_intent ${paymentIntent.id}`);
                break;
            }

            await prisma.coursePurchase.create({
                data: {
                    userId: userId,
                    courseId: courseId,
                    purchasePrice: parseFloat(purchasePrice),
                },
            });
            console.log(`--- Course ${courseId} purchased by user ${userId} ---`);

            await prisma.transaction.create({
              data: {
                userId: userId,
                amount: paymentIntent.amount / 100.0,
                currency: paymentIntent.currency,
                status: 'succeeded',
                stripeInvoiceId: paymentIntent.id,
              },
            });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }});
        if (!user) {
            console.error(`Webhook Error: User not found for Stripe Customer ${customerId} from subscription ${subscription.id}`);
            break;
        }

        // --- FIX 1: Correctly cast the status to your Prisma Enum ---
        const subscriptionStatus = mapStripeStatusToPrismaStatus(subscription.status);
        
        // --- FIX 2: Correctly access the nested period end property ---
        const periodEndTimestamp = subscription.cancel_at ?? subscription.items.data[0]?.current_period_end;
        const periodEnd = periodEndTimestamp ? new Date(periodEndTimestamp * 1000) : null;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscriptionStatus,
            currentPeriodEnd: periodEnd,
          },
        });
        console.log(`--- SUCCESS: Subscription ${subscription.id} for user ${user.id} status set to ${subscriptionStatus} ---`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            subscriptionStatus: SubscriptionStatus.CANCELED,
            currentPeriodEnd: null
          },
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