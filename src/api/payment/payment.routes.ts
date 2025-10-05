import { Router } from "express";
import { paymentController } from "./payment.controller";

const router = Router();

router.post("/create-intent/:userId", paymentController.createPaymentIntent);

export default router;