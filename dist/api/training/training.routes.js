"use strict";
// src/api/training/training.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const training_controller_1 = require("./training.controller");
const router = (0, express_1.Router)();
router.get('/courses', training_controller_1.getAllCourses);
router.get('/courses/:courseId', training_controller_1.getCourseById);
router.post('/videos/:videoId/progress', training_controller_1.updateVideoProgress);
exports.default = router;
