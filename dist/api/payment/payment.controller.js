"use strict";
// In ./src/api/payment/payment.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentController = void 0;
const client_1 = require("@prisma/client");
const stripe_1 = __importDefault(require("stripe"));
const prisma = new client_1.PrismaClient();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
exports.paymentController = {
    // --- OLD FUNCTION - UNCHANGED ---
    async createPaymentIntent(req, res) {
        // ... your existing code for one-time payments remains here, untouched
    },
    // --- NEW FUNCTION FOR EMBEDDED SUBSCRIPTION FORM ---
    async createSubscription(req, res) {
        const userId = req.user.userId;
        const { priceId, paymentMethodId } = req.body;
        if (!priceId || !paymentMethodId) {
            return res.status(400).json({ error: 'priceId and paymentMethodId are required.' });
        }
        try {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user || !user.stripeCustomerId) {
                return res.status(404).json({ error: 'Stripe customer not found.' });
            }
            // 1. Attach the payment method to the customer
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: user.stripeCustomerId,
            });
            // 2. Set it as the default for the subscription
            await stripe.customers.update(user.stripeCustomerId, {
                invoice_settings: { default_payment_method: paymentMethodId },
            });
            // 3. Create the subscription
            const subscription = await stripe.subscriptions.create({
                customer: user.stripeCustomerId,
                items: [{ price: priceId }],
                expand: ["latest_invoice.payment_intent"], // CRITICAL: This gets the PaymentIntent for 3D Secure
            });
            const latestInvoice = subscription.latest_invoice;
            const paymentIntent = latestInvoice.payment_intent;
            // 4. Check the status and respond accordingly
            if (paymentIntent && paymentIntent.status === 'requires_action') {
                // The bank requires 3D Secure authentication. Send the client_secret to the frontend.
                res.status(200).json({
                    status: 'requires_action',
                    clientSecret: paymentIntent.client_secret,
                    subscriptionId: subscription.id
                });
            }
            else if (subscription.status === 'active') {
                // The subscription was created successfully without needing extra authentication.
                res.status(200).json({ status: 'active', subscriptionId: subscription.id });
            }
            else {
                // Handle other statuses if necessary
                res.status(400).json({ status: subscription.status, error: 'Subscription failed to activate.' });
            }
        }
        catch (error) {
            console.error("Stripe subscription creation failed:", error);
            res.status(500).json({ error: 'Failed to create subscription.' });
        }
    },
    // --- UNUSED FUNCTION - WE LEAVE IT TO AVOID BREAKING ROUTES ---
    async createCustomerPortalSession(req, res) {
        // This function for the Stripe-hosted portal is now unused but we keep it.
        res.status(501).json({ message: 'Not implemented for this flow.' });
    }
};
