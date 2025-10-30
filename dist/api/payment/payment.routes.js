"use strict";
// In ./src/api/payment/payment.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get("/products", payment_controller_1.paymentController.getProductsAndPrices);
router.post("/create-subscription", auth_middleware_1.authMiddleware, payment_controller_1.paymentController.createSubscription);
router.post("/create-course-payment-intent", auth_middleware_1.authMiddleware, payment_controller_1.paymentController.createCoursePaymentIntent);
exports.default = router;
