"use strict";
// In ./src/api/payment/payment.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
const router = (0, express_1.Router)();
// This route is for the old one-time payment flow.
router.post("/create-intent/:userId", payment_controller_1.paymentController.createPaymentIntent);
// This is the new, correct route for creating a subscription.
router.post("/create-subscription", payment_controller_1.paymentController.createSubscription);
exports.default = router;
