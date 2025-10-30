"use strict";
// In ./src/api/webhook/webhook.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookController = void 0;
const client_1 = require("@prisma/client"); // --- FIX: IMPORT ENUM ---
const stripe_1 = __importDefault(require("stripe"));
const prisma = new client_1.PrismaClient();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
exports.webhookController = {
    async stripeWebhook(req, res) {
        const sig = req.headers["stripe-signature"];
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        }
        catch (err) {
            console.error("⚠️ Webhook signature verification failed.", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        switch (event.type) {
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
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
                const paymentIntent = event.data.object;
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
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
                if (!user) {
                    console.error(`Webhook Error: User not found for Stripe Customer ${customerId} from subscription ${subscription.id}`);
                    break;
                }
                // --- FIX 1: Correctly cast the status to your Prisma Enum ---
                const subscriptionStatus = subscription.status.toUpperCase();
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
                const subscription = event.data.object;
                await prisma.user.updateMany({
                    where: { stripeSubscriptionId: subscription.id },
                    data: {
                        subscriptionStatus: 'CANCELED',
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
