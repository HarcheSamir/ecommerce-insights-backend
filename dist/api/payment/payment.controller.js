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
    // --- NEW FUNCTION FOR EMBEDDED SUBSCRIPTION FORM ---
    async createSubscription(req, res) {
        const userId = req.user.userId;
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
            const latestInvoice = subscription.latest_invoice;
            const paymentIntent = latestInvoice.payment_intent;
            if (paymentIntent && paymentIntent.status === 'requires_action') {
                res.status(200).json({
                    status: 'requires_action',
                    clientSecret: paymentIntent.client_secret,
                    subscriptionId: subscription.id
                });
            }
            else if (subscription.status === 'active') {
                res.status(200).json({ status: 'active', subscriptionId: subscription.id });
            }
            else {
                res.status(400).json({ status: subscription.status, error: 'Subscription failed to activate.' });
            }
        }
        catch (error) {
            console.error("Stripe subscription creation failed:", error);
            res.status(500).json({ error: 'Failed to create subscription.' });
        }
    },
    async createCoursePaymentIntent(req, res) {
        const { courseId } = req.body;
        const userId = req.user.userId;
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
        }
        catch (error) {
            console.error("Course Payment Intent creation failed:", error);
            res.status(500).json({ error: 'Failed to create Payment Intent.' });
        }
    },
    async getProductsAndPrices(req, res) {
        try {
            const prices = await stripe.prices.list({
                active: true,
                expand: ['data.product'],
            });
            const formattedPrices = prices.data.map(price => {
                const product = price.product;
                return {
                    id: price.id,
                    name: product.name,
                    description: product.description,
                    price: price.unit_amount, // This is in cents
                    currency: price.currency,
                    interval: price.recurring?.interval,
                };
            });
            res.status(200).json(formattedPrices);
        }
        catch (error) {
            console.error("Failed to fetch products and prices from Stripe:", error);
            res.status(500).json({ error: 'Failed to fetch subscription plans.' });
        }
    },
};
