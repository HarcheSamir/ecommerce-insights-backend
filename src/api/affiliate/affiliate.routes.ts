import { Router } from 'express';
import { getAffiliateDashboard } from './affiliate.controller';

const router = Router();

// This single endpoint provides all data for the affiliate dashboard
router.get('/dashboard', getAffiliateDashboard);

export default router;