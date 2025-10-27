"use strict";
// src/api/product-discovery/product-discovery.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductTrends = exports.getCategories = exports.favoriteProduct = exports.getSingleProduct = exports.getWinningProducts = void 0;
const index_1 = require("../../index");
const google_trends_api_1 = __importDefault(require("google-trends-api"));
/**
 * @description Get a paginated, filterable, and sortable list of winning products.
 */
const getWinningProducts = async (req, res) => {
    try {
        const { keyword, category, minPrice, maxPrice, sortBy = 'salesVolume', page = 1, limit = 20, } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        if (keyword) {
            where.title = { contains: keyword };
        }
        if (category) {
            where.firstLevelCategoryName = category;
        }
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice)
                where.price.gte = parseFloat(minPrice);
            if (maxPrice)
                where.price.lte = parseFloat(maxPrice);
        }
        let orderBy = { salesVolume: 'desc' };
        if (sortBy === 'price_asc')
            orderBy = { price: 'asc' };
        if (sortBy === 'price_desc')
            orderBy = { price: 'desc' };
        if (sortBy === 'newest')
            orderBy = { importedAt: 'desc' };
        const [products, total] = await index_1.prisma.$transaction([
            index_1.prisma.winningProduct.findMany({
                where,
                orderBy,
                skip,
                take: limitNum,
            }),
            index_1.prisma.winningProduct.count({ where }),
        ]);
        res.status(200).json({
            data: products,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    }
    catch (error) {
        console.error('Error in getWinningProducts:', error);
        res.status(500).json({
            error: 'An internal server error occurred.',
            message: error.message
        });
    }
};
exports.getWinningProducts = getWinningProducts;
/**
 * @description Get details for a single winning product by its ID.
 */
const getSingleProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await index_1.prisma.winningProduct.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.status(200).json({ data: product });
    }
    catch (error) {
        console.error('Error in getSingleProduct:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.getSingleProduct = getSingleProduct;
/**
 * @description Add a product to the authenticated user's favorites.
 */
const favoriteProduct = async (req, res) => {
    try {
        const { id: productId } = req.params;
        const userId = req.user.userId;
        await index_1.prisma.userFavorite.create({
            data: { userId, productId },
        });
        res.status(201).json({ message: 'Product added to favorites.' });
    }
    catch (error) {
        console.error('Error in favoriteProduct:', error);
        if (error.code === 'P2002') { // Unique constraint violation
            return res.status(409).json({ error: 'Product is already in favorites.' });
        }
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.favoriteProduct = favoriteProduct;
/**
 * @description Get a unique list of all product categories.
 */
const getCategories = async (req, res) => {
    try {
        const categories = await index_1.prisma.winningProduct.findMany({
            where: { firstLevelCategoryName: { not: null } },
            distinct: ['firstLevelCategoryName'],
            select: { firstLevelCategoryName: true },
            orderBy: { firstLevelCategoryName: 'asc' },
        });
        res.status(200).json({ data: categories.map(c => c.firstLevelCategoryName) });
    }
    catch (error) {
        console.error('Error in getCategories:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.getCategories = getCategories;
/**
 * @description Get Google Trends data for a single product.
 */
const getProductTrends = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await index_1.prisma.winningProduct.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        if (!product.googleTrendKeyword) {
            return res.status(404).json({ error: 'Trend keyword has not been generated for this product yet.' });
        }
        // Fetch data for the last 12 months
        const trendsData = await google_trends_api_1.default.interestOverTime({
            keyword: product.googleTrendKeyword,
            startTime: new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)), // 1 year ago
            endTime: new Date(),
        });
        const parsedData = JSON.parse(trendsData).default.timelineData;
        res.status(200).json({ data: parsedData });
    }
    catch (error) {
        console.error('Error in getProductTrends:', error);
        res.status(500).json({ error: 'An internal server error occurred while fetching trend data.' });
    }
};
exports.getProductTrends = getProductTrends;
