// src/index.ts
import 'dotenv/config'; // ADD THIS LINE FIRST

import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import authRoutes from './api/auth/auth.routes';
import paymentRoutes from './api/payment/payment.routes';
import webhookRoutes from './api/webhook/webhook.routes';
import { hasMembershipMiddleware } from './middleware/hasMembership.middleware';
import contentCreatorRoutes from './api/content-creator/content-creator.routes';
import userRoutes from './api/user/user.routes';
import { authMiddleware } from './middleware/auth.middleware';
import trainingRoutes from './api/training/training.routes';
import cors from 'cors';

const app = express();  
export const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Enable CORS for specific origin or all origins
app.use(cors({
  origin: ['https://influencecontact.com', 'http://localhost:5173'], // Allow both production and local dev
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use('/webhook', webhookRoutes);

// Middleware to parse JSON bodies
app.use(express.json());

// A simple test route
app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Express + TypeScript + Prisma!');
});
app.use('/api/auth', authRoutes);
// app.use('/api/content-creators', authMiddleware,contentCreatorRoutes);
app.use('/api/content-creators', authMiddleware, hasMembershipMiddleware,contentCreatorRoutes);

app.use('/api/profile',authMiddleware,userRoutes)
app.use('/api/payment', authMiddleware,paymentRoutes);
app.use('/api/training', authMiddleware, trainingRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});