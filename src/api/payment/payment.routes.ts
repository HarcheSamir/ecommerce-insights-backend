// In ./src/api/payment/payment.routes.ts

import { Router } from "express";
import { paymentController } from "./payment.controller";

const router = Router();

// This route is for the old one-time payment flow.
router.post("/create-intent/:userId", paymentController.createPaymentIntent);

// This is the new, correct route for creating a subscription.
router.post("/create-subscription", paymentController.createSubscription);

router.post("/create-course-checkout-session", paymentController.createCourseCheckoutSession);

router.post("/create-course-payment-intent", paymentController.createCoursePaymentIntent);


export default router;