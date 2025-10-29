"use strict";
// In ./src/middleware/hasMembership.middleware.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMembershipMiddleware = void 0;
const __1 = require("..");
const hasMembershipMiddleware = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized. Please log in.' });
    }
    // Admins always have access
    if (req.user.accountType === 'ADMIN') {
        return next();
    }
    const { userId } = req.user;
    const user = await __1.prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionStatus: true }
    });
    // Grant access only if the user's subscription is active or in a trial period.
    if (!user || (user.subscriptionStatus !== 'ACTIVE' && user.subscriptionStatus !== 'TRIALING')) {
        return res.status(403).json({ message: 'Forbidden. Active subscription required.' });
    }
    next();
};
exports.hasMembershipMiddleware = hasMembershipMiddleware;
