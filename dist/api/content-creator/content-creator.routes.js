"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const content_creator_controller_1 = require("./content-creator.controller");
const router = (0, express_1.Router)();
// Route for getting the authenticated user's full profile
// This route must be protected by your authentication middleware
router.post('/search', content_creator_controller_1.searchContentCreators);
router.get('/regions', content_creator_controller_1.searchRegions);
// Route for updating the authenticated user's password
// This route must also be protected by your authentication middleware
router.get('/:creatorId/visit', content_creator_controller_1.recordProfileVisit);
exports.default = router;
