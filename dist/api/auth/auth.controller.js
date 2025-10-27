"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_service_1 = require("./auth.service");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set!');
}
exports.authController = {
    // --- SIGNUP CONTROLLER ---
    async signUp(req, res) {
        try {
            const { user, token } = await auth_service_1.authService.signUp(req.body);
            res.status(201).json({ message: 'User created successfully', user, token });
        }
        catch (error) {
            res.status(409).json({ message: error.message }); // 409 Conflict
        }
    },
    // --- LOGIN CONTROLLER ---
    async login(req, res) {
        try {
            const user = await auth_service_1.authService.login(req.body);
            // Create JWT Payload
            const payload = {
                userId: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                accountType: user.accountType,
            };
            // Sign the token
            const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '7d' }); // Token expires in 7 days
            res.status(200).json({
                message: 'Login successful',
                token: token,
                user: user,
            });
        }
        catch (error) {
            res.status(401).json({ message: error.message }); // 401 Unauthorized
        }
    },
};
