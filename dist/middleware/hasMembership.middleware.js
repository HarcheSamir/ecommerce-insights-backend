"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMembershipMiddleware = void 0;
const __1 = require("..");
const hasMembershipMiddleware = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized. Please log in.' });
    }
    // --- MODIFICATION START ---
    // First, check if the user is an admin. If so, grant access immediately.
    if (req.user.accountType === 'ADMIN') {
        return next(); // Admin passes without needing a membership
    }
    // --- MODIFICATION END ---
    const { userId } = req.user;
    const count = await __1.prisma.transaction.count({
        where: { userId: userId, status: 'succeeded' },
    });
    if (count == 0) {
        return res.status(403).json({ message: 'Forbidden. Membership required.' });
    }
    next();
};
exports.hasMembershipMiddleware = hasMembershipMiddleware;
