"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSettings = exports.getSettings = exports.updateVideoOrder = exports.deleteVideo = exports.updateVideo = exports.deleteSection = exports.updateSection = exports.deleteCourse = exports.addVideoToSection = exports.createSection = exports.getCourseDetails = exports.getAdminCourses = exports.updateCourse = exports.createCourse = exports.getAdminDashboardStats = void 0;
const index_1 = require("../../index");
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
// --- Dashboard Stats Controller ---
const getAdminDashboardStats = async (req, res) => {
    try {
        const [activeSubscribers, totalUsers, totalRevenue, totalVideos, totalCourses, totalInfluencers, totalProducts,] = await index_1.prisma.$transaction([
            index_1.prisma.transaction.count({ where: { status: 'succeeded' } }),
            index_1.prisma.user.count(),
            index_1.prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: 'succeeded' } }),
            index_1.prisma.video.count(),
            index_1.prisma.videoCourse.count(),
            index_1.prisma.contentCreator.count(),
            index_1.prisma.winningProduct.count(),
        ]);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenueData = await index_1.prisma.transaction.groupBy({
            by: ['createdAt'],
            where: { status: 'succeeded', createdAt: { gte: sixMonthsAgo } },
            _sum: { amount: true },
            orderBy: { createdAt: 'asc' }
        });
        const monthlyRevenueChart = monthlyRevenueData.reduce((acc, item) => {
            const month = new Date(item.createdAt).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
            if (!acc[month])
                acc[month] = 0;
            acc[month] += item._sum.amount || 0;
            return acc;
        }, {});
        res.status(200).json({
            activeSubscribers,
            totalUsers,
            monthlyRevenue: totalRevenue._sum.amount || 0,
            totalVideos,
            totalCourses,
            totalInfluencers,
            totalProducts,
            monthlyRevenueChart,
        });
    }
    catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.getAdminDashboardStats = getAdminDashboardStats;
// --- Course Management Controllers ---
const createCourse = async (req, res) => {
    const { title, description, coverImageUrl, price } = req.body;
    if (!title || !coverImageUrl) {
        return res.status(400).json({ error: 'Title and coverImageUrl are required.' });
    }
    try {
        let stripePriceId = null;
        if (price && Number(price) > 0) {
            const product = await stripe.products.create({ name: title });
            const stripePrice = await stripe.prices.create({
                product: product.id,
                unit_amount: Math.round(Number(price) * 100),
                currency: 'eur',
            });
            stripePriceId = stripePrice.id;
        }
        const course = await index_1.prisma.videoCourse.create({
            data: {
                title,
                description,
                coverImageUrl,
                price: price ? Number(price) : null,
                stripePriceId
            },
        });
        res.status(201).json(course);
    }
    catch (error) {
        console.error("Course creation failed:", error);
        res.status(500).json({ error: 'Could not create course.' });
    }
};
exports.createCourse = createCourse;
const updateCourse = async (req, res) => {
    const { courseId } = req.params;
    const { title, description, coverImageUrl, price } = req.body;
    try {
        const existingCourse = await index_1.prisma.videoCourse.findUnique({ where: { id: courseId } });
        if (!existingCourse) {
            return res.status(404).json({ error: 'Course not found' });
        }
        let stripePriceId = existingCourse.stripePriceId;
        // If price is being set or changed
        if (price !== undefined && Number(price) !== existingCourse.price) {
            // A simple implementation: create a new product/price.
            // A more complex one would update/archive old ones.
            if (Number(price) > 0) {
                const product = await stripe.products.create({ name: title });
                const stripePrice = await stripe.prices.create({
                    product: product.id,
                    unit_amount: Math.round(Number(price) * 100),
                    currency: 'eur',
                });
                stripePriceId = stripePrice.id;
            }
            else {
                stripePriceId = null; // Setting price to 0 or null
            }
        }
        const updatedCourse = await index_1.prisma.videoCourse.update({
            where: { id: courseId },
            data: {
                title,
                description,
                coverImageUrl,
                price: price ? Number(price) : null,
                stripePriceId
            },
        });
        res.status(200).json(updatedCourse);
    }
    catch (error) {
        console.error("Course update failed:", error);
        res.status(500).json({ error: 'Could not update course.' });
    }
};
exports.updateCourse = updateCourse;
const getAdminCourses = async (req, res) => {
    try {
        const coursesFromDb = await index_1.prisma.videoCourse.findMany({
            orderBy: { order: 'asc' },
            include: {
                sections: { select: { _count: { select: { videos: true } } } }
            }
        });
        const courses = coursesFromDb.map(course => {
            const totalVideos = course.sections.reduce((sum, section) => sum + section._count.videos, 0);
            const { sections, ...rest } = course;
            return { ...rest, totalVideos };
        });
        res.status(200).json(courses);
    }
    catch (error) {
        console.error('Error in getAdminCourses:', error);
        res.status(500).json({ error: 'Could not fetch courses.' });
    }
};
exports.getAdminCourses = getAdminCourses;
const getCourseDetails = async (req, res) => {
    const { courseId } = req.params;
    try {
        const course = await index_1.prisma.videoCourse.findUnique({
            where: { id: courseId },
            include: {
                sections: {
                    orderBy: { order: 'asc' },
                    include: { videos: { orderBy: { order: 'asc' } } }
                }
            }
        });
        if (!course)
            return res.status(404).json({ error: 'Course not found.' });
        res.status(200).json(course);
    }
    catch (error) {
        res.status(500).json({ error: 'Could not fetch course details.' });
    }
};
exports.getCourseDetails = getCourseDetails;
const createSection = async (req, res) => {
    const { courseId } = req.params;
    const { title, order } = req.body;
    if (!title)
        return res.status(400).json({ error: 'Title is required.' });
    try {
        const section = await index_1.prisma.section.create({
            data: { title, order: order || 0, courseId },
        });
        res.status(201).json(section);
    }
    catch (error) {
        res.status(500).json({ error: 'Could not create section.' });
    }
};
exports.createSection = createSection;
const addVideoToSection = async (req, res) => {
    const { sectionId } = req.params;
    // --- MODIFICATION START ---
    // Read all fields from the request body and add types
    const { title, vimeoId, duration, description, order } = req.body;
    // --- MODIFICATION END ---
    if (!title || !vimeoId) {
        return res.status(400).json({ error: 'Title and vimeoId are required.' });
    }
    try {
        const video = await index_1.prisma.video.create({
            data: {
                title,
                vimeoId,
                // --- MODIFICATION START ---
                // Use the values from the request, with fallbacks
                duration: duration || 0,
                description,
                order: order || 0,
                // --- MODIFICATION END ---
                sectionId: sectionId
            },
        });
        res.status(201).json(video);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Could not add video to section.' });
    }
};
exports.addVideoToSection = addVideoToSection;
const deleteCourse = async (req, res) => {
    const { courseId } = req.params;
    try {
        await index_1.prisma.videoCourse.delete({ where: { id: courseId } });
        res.status(204).send(); // No Content
    }
    catch (error) {
        res.status(500).json({ error: 'Could not delete course.' });
    }
};
exports.deleteCourse = deleteCourse;
const updateSection = async (req, res) => {
    const { sectionId } = req.params;
    const { title, order } = req.body;
    try {
        const updatedSection = await index_1.prisma.section.update({
            where: { id: sectionId },
            data: { title, order },
        });
        res.status(200).json(updatedSection);
    }
    catch (error) {
        res.status(500).json({ error: 'Could not update section.' });
    }
};
exports.updateSection = updateSection;
const deleteSection = async (req, res) => {
    const { sectionId } = req.params;
    try {
        await index_1.prisma.section.delete({ where: { id: sectionId } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Could not delete section.' });
    }
};
exports.deleteSection = deleteSection;
const updateVideo = async (req, res) => {
    const { videoId } = req.params;
    const { title, vimeoId, description, duration, order } = req.body;
    try {
        const updatedVideo = await index_1.prisma.video.update({
            where: { id: videoId },
            data: { title, vimeoId, description, duration, order },
        });
        res.status(200).json(updatedVideo);
    }
    catch (error) {
        res.status(500).json({ error: 'Could not update video.' });
    }
};
exports.updateVideo = updateVideo;
const deleteVideo = async (req, res) => {
    const { videoId } = req.params;
    try {
        await index_1.prisma.video.delete({ where: { id: videoId } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Could not delete video.' });
    }
};
exports.deleteVideo = deleteVideo;
const updateVideoOrder = async (req, res) => {
    const { videos } = req.body;
    if (!Array.isArray(videos)) {
        return res.status(400).json({ error: 'A "videos" array is required.' });
    }
    try {
        const updatePromises = videos.map(video => index_1.prisma.video.update({
            where: { id: video.id },
            data: { order: video.order },
        }));
        await index_1.prisma.$transaction(updatePromises);
        res.status(200).json({ message: 'Video order updated successfully.' });
    }
    catch (error) {
        console.error("Error updating video order:", error);
        res.status(500).json({ error: 'Could not update video order.' });
    }
};
exports.updateVideoOrder = updateVideoOrder;
const getSettings = async (req, res) => {
    try {
        const settings = await index_1.prisma.setting.findMany();
        const settingsObject = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
        res.status(200).json(settingsObject);
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.getSettings = getSettings;
const updateSettings = async (req, res) => {
    const settingsToUpdate = req.body;
    try {
        const updatePromises = Object.entries(settingsToUpdate).map(([key, value]) => index_1.prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
        }));
        await index_1.prisma.$transaction(updatePromises);
        res.status(200).json({ message: 'Settings updated successfully.' });
    }
    catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.updateSettings = updateSettings;
