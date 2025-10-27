"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("./user.controller");
const router = (0, express_1.Router)();
// Route for getting the authenticated user's full profile
// This route must be protected by your authentication middleware
router.get('/me', user_controller_1.getUserProfile);
// Route for updating the authenticated user's password
// This route must also be protected by your authentication middleware
router.patch('/update-password', user_controller_1.updatePassword);
// Route for getting user notifications
router.get('/notifications', user_controller_1.getUserNotifications);
router.patch('/me', user_controller_1.updateUserProfile);
exports.default = router;
