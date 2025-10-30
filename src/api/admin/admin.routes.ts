import { Router } from 'express';
import { 
    getAdminDashboardStats, createCourse, getAdminCourses, getCourseDetails,
    createSection, addVideoToSection, updateCourse, deleteCourse, 
    updateSection, deleteSection, updateVideo, deleteVideo, updateVideoOrder,
    getSettings, updateSettings
} from './admin.controller';
import { 
    getAffiliateLeaderboard, 
    getPayoutRequests, 
    updatePayoutStatus 
} from './affiliate.controller';

const router = Router();

// Stats
router.get('/stats', getAdminDashboardStats);

// Course Management
router.get('/courses', getAdminCourses);
router.post('/courses', createCourse);
router.get('/courses/:courseId', getCourseDetails);
router.put('/courses/:courseId', updateCourse); // EDIT
router.delete('/courses/:courseId', deleteCourse); // DELETE

// Section Management
router.post('/courses/:courseId/sections', createSection);
router.put('/sections/:sectionId', updateSection); // EDIT
router.delete('/sections/:sectionId', deleteSection); // DELETE

// Video Management
router.post('/sections/:sectionId/videos', addVideoToSection);
router.put('/videos/:videoId', updateVideo); // EDIT
router.delete('/videos/:videoId', deleteVideo); // DELETE
router.put('/sections/:sectionId/videos/order', updateVideoOrder);

router.get('/affiliates/leaderboard', getAffiliateLeaderboard);
router.get('/payouts', getPayoutRequests);
router.patch('/payouts/:payoutId/status', updatePayoutStatus);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

export default router;