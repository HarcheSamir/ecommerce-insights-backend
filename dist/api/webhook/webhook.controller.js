"use strict";
// In ./src/api/webhook/webhook.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookController = void 0;
const client_1 = require("@prisma/client");
const stripe_1 = __importDefault(require("stripe"));
const prisma = new client_1.PrismaClient();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
const AFFILIATE_COMMISSION_RATE = 0.20;
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
        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                if (session.mode === 'subscription') {
                    const subscriptionId = session.subscription;
                    const userId = session.client_reference_id;
                    // --- SURGICAL FIX START ---
                    // Retrieve the subscription object and cast to 'any' to bypass the incorrect type error.
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    // --- SURGICAL FIX END ---
                    await prisma.user.update({
                        where: { id: userId },
                        data: {
                            stripeSubscriptionId: subscription.id,
                            subscriptionStatus: 'ACTIVE',
                            currentPeriodEnd: new Date(subscription.current_period_end * 1000), // This line will now compile
                        },
                    });
                }
                break;
            }
            case 'customer.subscription.updated': {
                // --- SURGICAL FIX START ---
                // Cast the event object to 'any' to bypass the incorrect type error.
                const subscription = event.data.object;
                // --- SURGICAL FIX END ---
                await prisma.user.updateMany({
                    where: { stripeSubscriptionId: subscription.id },
                    data: {
                        subscriptionStatus: subscription.status.toUpperCase(),
                        currentPeriodEnd: new Date(subscription.current_period_end * 1000), // This line will now compile
                    },
                });
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await prisma.user.updateMany({
                    where: { stripeSubscriptionId: subscription.id },
                    data: {
                        subscriptionStatus: 'CANCELED',
                    },
                });
                break;
            }
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                await prisma.transaction.updateMany({
                    where: { stripeInvoiceId: paymentIntent.id },
                    data: { status: "succeeded" },
                });
                const transaction = await prisma.transaction.findFirst({
                    where: { stripeInvoiceId: paymentIntent.id },
                    include: { user: true }
                });
                if (transaction && transaction.user && transaction.user.referredById) {
                    const affiliateId = transaction.user.referredById;
                    const commissionAmount = transaction.amount * AFFILIATE_COMMISSION_RATE;
                    const existingCommission = await prisma.commission.findUnique({
                        where: { sourceTransactionId: transaction.id }
                    });
                    if (!existingCommission) {
                        await prisma.commission.create({
                            data: {
                                amount: commissionAmount,
                                affiliateId: affiliateId,
                                sourceTransactionId: transaction.id
                            }
                        });
                    }
                }
                break;
            }
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
        res.json({ received: true });
    }
};
