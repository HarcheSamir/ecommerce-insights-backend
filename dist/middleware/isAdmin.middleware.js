"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminMiddleware = void 0;
const __1 = require("..");
const isAdminMiddleware = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;
    try {
        const user = await __1.prisma.user.findUnique({
            where: { id: userId },
            select: { accountType: true },
        });
        if (!user || user.accountType !== 'ADMIN') {
            return res.status(403).json({ message: 'Forbidden. Administrator access required.' });
        }
        next();
    }
    catch (error) {
        return res.status(500).json({ message: 'An internal server error occurred.' });
    }
};
exports.isAdminMiddleware = isAdminMiddleware;
