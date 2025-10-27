"use strict";
// src/api/product-discovery/product-discovery.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_discovery_controller_1 = require("./product-discovery.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/meta/categories', product_discovery_controller_1.getCategories);
router.get('/', product_discovery_controller_1.getWinningProducts);
router.get('/:id', product_discovery_controller_1.getSingleProduct);
router.post('/:id/favorite', auth_middleware_1.authMiddleware, product_discovery_controller_1.favoriteProduct);
router.get('/:id/trends', auth_middleware_1.authMiddleware, product_discovery_controller_1.getProductTrends);
exports.default = router;
