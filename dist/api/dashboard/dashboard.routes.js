"use strict";
// src/api/dashboard/dashboard.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("./dashboard.controller");
const router = (0, express_1.Router)();
// This route will provide the aggregated numbers for the dashboard cards.
router.get('/stats', dashboard_controller_1.getDashboardStats);
exports.default = router;
