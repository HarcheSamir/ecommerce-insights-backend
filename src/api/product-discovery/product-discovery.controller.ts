// src/api/product-discovery/product-discovery.controller.ts

import { Request, Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import trends from 'google-trends-api'; 

/**
 * @description Get a paginated, filterable, and sortable list of winning products.
 */
export const getWinningProducts = async (req: Request, res: Response) => {
  try {
    const {
      keyword,
      category,
      minPrice,
      maxPrice,
      sortBy = 'salesVolume',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (keyword) {
      where.title = { contains: keyword as string };
    }
    if (category) {
      where.firstLevelCategoryName = category as string;
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    let orderBy: any = { salesVolume: 'desc' };
    if (sortBy === 'price_asc') orderBy = { price: 'asc' };
    if (sortBy === 'price_desc') orderBy = { price: 'desc' };
    if (sortBy === 'newest') orderBy = { importedAt: 'desc' };

    const [products, total] = await prisma.$transaction([
      prisma.winningProduct.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.winningProduct.count({ where }),
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
  } catch (error) {
    console.error('Error in getWinningProducts:', error);
    res.status(500).json({ 
        error: 'An internal server error occurred.',
        message: (error as Error).message 
    });
  }
};

/**
 * @description Get details for a single winning product by its ID.
 */
export const getSingleProduct = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const product = await prisma.winningProduct.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.status(200).json({ data: product });
    } catch (error) {
        console.error('Error in getSingleProduct:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

/**
 * @description Add a product to the authenticated user's favorites.
 */
export const favoriteProduct = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id: productId } = req.params;
        const userId = req.user!.userId;

        await prisma.userFavorite.create({
            data: { userId, productId },
        });
        res.status(201).json({ message: 'Product added to favorites.' });
    } catch (error) {
        console.error('Error in favoriteProduct:', error);
        if ((error as any).code === 'P2002') { // Unique constraint violation
            return res.status(409).json({ error: 'Product is already in favorites.' });
        }
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

/**
 * @description Get a unique list of all product categories.
 */
export const getCategories = async (req: Request, res: Response) => {
    try {
        const categories = await prisma.winningProduct.findMany({
            where: { firstLevelCategoryName: { not: null } },
            distinct: ['firstLevelCategoryName'],
            select: { firstLevelCategoryName: true },
            orderBy: { firstLevelCategoryName: 'asc' },
        });
        res.status(200).json({ data: categories.map(c => c.firstLevelCategoryName) });
    } catch (error) {
        console.error('Error in getCategories:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};


/**
 * @description Get Google Trends data for a single product.
 */
export const getProductTrends = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const product = await prisma.winningProduct.findUnique({ where: { id } });
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        if (!product.googleTrendKeyword) {
            return res.status(404).json({ error: 'Trend keyword has not been generated for this product yet.' });
        }

        // Fetch data for the last 12 months
        const trendsData = await trends.interestOverTime({
            keyword: product.googleTrendKeyword,
            startTime: new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)), // 1 year ago
            endTime: new Date(),
        });

        const parsedData = JSON.parse(trendsData).default.timelineData;

        res.status(200).json({ data: parsedData });

    } catch (error) {
        console.error('Error in getProductTrends:', error);
        res.status(500).json({ error: 'An internal server error occurred while fetching trend data.' });
    }
};