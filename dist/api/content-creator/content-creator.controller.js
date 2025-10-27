"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchRegions = exports.recordProfileVisit = exports.searchContentCreators = void 0;
const index_1 = require("../../index");
const client_1 = require("@prisma/client");
/**
 * @description Search for content creators, now using the authenticated user's ID.
 * @route POST /api/content-creators/search
 */
const searchContentCreators = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized. Please log in.' });
        }
        const { userId } = req.user;
        const { keyword, country, platform, // NEW
        minFollowers, // NEW
        maxFollowers, // NEW
        page = 1, limit = 10 } = req.body;
        const where = {};
        // Existing country filter
        if (country) {
            where.country = { contains: country };
        }
        // Existing keyword filter
        if (keyword && keyword.trim() !== '') {
            where.OR = [
                { nickname: { contains: keyword } },
                { username: { contains: keyword } },
                { bio: { contains: keyword } },
                { niche: { name: { contains: keyword } } },
            ];
        }
        // NEW: Platform filter
        // NEW: Platform filter
        if (platform) {
            if (platform === 'instagram') {
                where.instagram = { not: { equals: null } };
            }
            else if (platform === 'youtube') {
                where.youtube = { not: { equals: null } };
            }
            else if (platform === 'tiktok') {
                where.profileLink = { not: undefined };
            }
        }
        // NEW: Follower range filter
        if (minFollowers !== undefined || maxFollowers !== undefined) {
            where.followers = {};
            if (minFollowers !== undefined) {
                where.followers.gte = minFollowers;
            }
            if (maxFollowers !== undefined) {
                where.followers.lte = maxFollowers;
            }
        }
        // Rest of your existing code...
        const skip = (page - 1) * limit;
        const [contentCreators, total] = await index_1.prisma.$transaction([
            index_1.prisma.contentCreator.findMany({
                where,
                skip,
                take: limit,
                include: { region: true, niche: true }
            }),
            index_1.prisma.contentCreator.count({ where }),
        ]);
        // Record search history
        if (keyword || country || platform || minFollowers || maxFollowers) {
            await index_1.prisma.searchHistory.create({
                data: {
                    userId,
                    keyword: keyword ?? '',
                    country: country || null
                },
            });
        }
        return res.status(200).json({
            data: contentCreators,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error('Error searching content creators:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.searchContentCreators = searchContentCreators;
/**
 * @description Records that an authenticated user has visited a content creator's profile.
 * @route POST /api/content-creators/:creatorId/visit
 */
const recordProfileVisit = async (req, res) => {
    try {
        // 1. Check for authenticated user
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized. Please log in.' });
        }
        const { userId } = req.user;
        const { creatorId } = req.params;
        // 2. Validate the creatorId
        if (!creatorId) {
            return res.status(400).json({ error: 'Content Creator ID is required.' });
        }
        // 3. Create the visit record in the database
        await index_1.prisma.visitedProfile.create({
            data: {
                userId,
                creatorId,
            },
        });
        return res.status(201).json({ message: 'Profile visit recorded successfully.' });
    }
    catch (error) {
        console.error('Error recording profile visit:', error);
        // Handle specific error, e.g., if creatorId does not exist
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            return res.status(404).json({ error: 'Content creator not found.' });
        }
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.recordProfileVisit = recordProfileVisit;
const searchRegions = async (req, res) => {
    try {
        const regions = await index_1.prisma.region.findMany({
            select: {
                id: true,
                name: true,
                countryName: true,
                flag: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        return res.status(200).json({ data: regions });
    }
    catch (error) {
        console.error('Error fetching regions:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.searchRegions = searchRegions;
