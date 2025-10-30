// In ./src/api/payment/payment.routes.ts

import { Router } from "express";
import { paymentController } from "./payment.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();


router.get("/products", paymentController.getProductsAndPrices);


router.post("/create-subscription", authMiddleware, paymentController.createSubscription);
router.post("/create-course-payment-intent", authMiddleware, paymentController.createCoursePaymentIntent);


export default router;