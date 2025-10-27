"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET;
const prisma = new client_1.PrismaClient();
const SALT_ROUNDS = 10;
function exclude(user, keys) {
    for (let key of keys) {
        delete user[key];
    }
    return user;
}
exports.authService = {
    async signUp(userData) {
        const { email, password, firstName, lastName, refCode } = userData;
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            throw new Error('User with this email already exists.');
        }
        let referredById = null;
        if (refCode) {
            const referrer = await prisma.user.findUnique({
                where: { id: refCode }
            });
            if (!referrer) {
                throw new Error('Invalid referral code provided.');
            }
            referredById = referrer.id;
        }
        const hashedPassword = await bcrypt_1.default.hash(password, SALT_ROUNDS);
        // --- THIS IS THE DEFINITIVE FIX ---
        // The `referredById` variable is now correctly passed into the create call.
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
                referredById: referredById,
                accountType: email === 'admin@admin.com' ? 'ADMIN' : 'USER',
            },
        });
        // --- END OF FIX ---
        const payload = {
            userId: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            accountType: newUser.accountType,
        };
        const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        return {
            user: exclude(newUser, ['password']),
            token: token
        };
    },
    async login(credentials) {
        const { email, password } = credentials;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error('Invalid credentials.');
        }
        const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid credentials.');
        }
        return exclude(user, ['password']);
    },
};
