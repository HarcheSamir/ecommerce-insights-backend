"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
const router = (0, express_1.Router)();
router.post("/create-intent/:userId", payment_controller_1.paymentController.createPaymentIntent);
exports.default = router;
