"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthUser = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Fetches the full user profile from the database based on the userId
 * attached to the request object by the authentication middleware.
 * @param req The Express Request object.
 * @returns The user object without the password, or null if not found.
 */
const getAuthUser = async (req) => {
    if (!req.user) {
        return null;
    }
    const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            accountType: true,
            createdAt: true
        }
    });
    return user;
};
exports.getAuthUser = getAuthUser;
