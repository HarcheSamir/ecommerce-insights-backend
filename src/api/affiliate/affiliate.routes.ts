import { Router } from 'express';
import { getAffiliateDashboard, requestPayout } from './affiliate.controller';

const router = Router();

// This single endpoint provides all data for the affiliate dashboard
router.get('/dashboard', getAffiliateDashboard);
router.post('/request-payout', requestPayout);


export default router;