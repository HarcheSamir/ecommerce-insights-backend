"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("./admin.controller");
const affiliate_controller_1 = require("./affiliate.controller");
const router = (0, express_1.Router)();
// Stats
router.get('/stats', admin_controller_1.getAdminDashboardStats);
// Course Management
router.get('/courses', admin_controller_1.getAdminCourses);
router.post('/courses', admin_controller_1.createCourse);
router.get('/courses/:courseId', admin_controller_1.getCourseDetails);
router.put('/courses/:courseId', admin_controller_1.updateCourse); // EDIT
router.delete('/courses/:courseId', admin_controller_1.deleteCourse); // DELETE
// Section Management
router.post('/courses/:courseId/sections', admin_controller_1.createSection);
router.put('/sections/:sectionId', admin_controller_1.updateSection); // EDIT
router.delete('/sections/:sectionId', admin_controller_1.deleteSection); // DELETE
// Video Management
router.post('/sections/:sectionId/videos', admin_controller_1.addVideoToSection);
router.put('/videos/:videoId', admin_controller_1.updateVideo); // EDIT
router.delete('/videos/:videoId', admin_controller_1.deleteVideo); // DELETE
router.put('/sections/:sectionId/videos/order', admin_controller_1.updateVideoOrder);
router.get('/affiliates/leaderboard', affiliate_controller_1.getAffiliateLeaderboard);
router.get('/payouts', affiliate_controller_1.getPayoutRequests);
router.patch('/payouts/:payoutId/status', affiliate_controller_1.updatePayoutStatus);
exports.default = router;
