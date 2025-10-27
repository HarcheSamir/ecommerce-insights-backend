"use strict";
// src/api/dashboard/dashboard.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = void 0;
const index_1 = require("../../index");
/**
 * @description Fetches aggregated statistics for the main dashboard.
 * @route GET /api/dashboard/stats
 */
const getDashboardStats = async (req, res) => {
    try {
        // We run all queries in parallel for the best performance.
        const [totalCourses, distinctCountryRecords, totalWinningProducts, totalInfluencers] = await index_1.prisma.$transaction([
            index_1.prisma.videoCourse.count(),
            index_1.prisma.contentCreator.findMany({
                where: { country: { not: '' } },
                distinct: ['country'],
                select: { country: true },
            }),
            index_1.prisma.winningProduct.count(),
            // +++ THIS IS THE FIX +++
            // Add a query to count all records in the ContentCreator table.
            index_1.prisma.contentCreator.count(),
        ]);
        const countriesCovered = distinctCountryRecords.length;
        res.status(200).json({
            totalCourses,
            countriesCovered,
            totalWinningProducts,
            totalInfluencers, // <-- Return the new value
        });
    }
    catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'An internal server error occurred while fetching dashboard statistics.' });
    }
};
exports.getDashboardStats = getDashboardStats;
