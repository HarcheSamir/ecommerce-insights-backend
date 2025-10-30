"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const affiliate_controller_1 = require("./affiliate.controller");
const router = (0, express_1.Router)();
// This single endpoint provides all data for the affiliate dashboard
router.get('/dashboard', affiliate_controller_1.getAffiliateDashboard);
router.post('/request-payout', affiliate_controller_1.requestPayout);
exports.default = router;
