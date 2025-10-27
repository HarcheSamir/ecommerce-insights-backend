"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/index.ts
require("dotenv/config"); // ADD THIS LINE FIRST
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const auth_routes_1 = __importDefault(require("./api/auth/auth.routes"));
const payment_routes_1 = __importDefault(require("./api/payment/payment.routes"));
const webhook_routes_1 = __importDefault(require("./api/webhook/webhook.routes"));
const hasMembership_middleware_1 = require("./middleware/hasMembership.middleware");
const content_creator_routes_1 = __importDefault(require("./api/content-creator/content-creator.routes"));
const user_routes_1 = __importDefault(require("./api/user/user.routes"));
const auth_middleware_1 = require("./middleware/auth.middleware");
const training_routes_1 = __importDefault(require("./api/training/training.routes"));
const cors_1 = __importDefault(require("cors"));
const node_cron_1 = __importDefault(require("node-cron")); // Import node-cron
const product_discovery_service_1 = require("./api/product-discovery/product-discovery.service");
const product_discovery_routes_1 = __importDefault(require("./api/product-discovery/product-discovery.routes"));
const dashboard_routes_1 = __importDefault(require("./api/dashboard/dashboard.routes"));
const admin_routes_1 = __importDefault(require("./api/admin/admin.routes")); // <-- IMPORT NEW ROUTES
const isAdmin_middleware_1 = require("./middleware/isAdmin.middleware");
const affiliate_routes_1 = __importDefault(require("./api/affiliate/affiliate.routes"));
const child_process_1 = require("child_process");
BigInt.prototype.toJSON = function () {
    return this.toString();
};
const app = (0, express_1.default)();
exports.prisma = new client_1.PrismaClient();
const PORT = process.env.PORT || 3000;
// Enable CORS for specific origin or all origins
app.use((0, cors_1.default)({
    origin: ['https://influencecontact.com', 'http://localhost:5173', 'https://makebrainers.com'], // Allow both production and local dev
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use('/webhook', webhook_routes_1.default);
// Middleware to parse JSON bodies
app.use(express_1.default.json());
// A simple test route
app.get('/', (req, res) => {
    res.send('Hello from Express + TypeScript + Prisma!');
});
// ===================================================================
// === MANUAL TRIGGER ENDPOINT (UNAUTHENTICATED) =====================
// ===================================================================
app.get('/api/admin/trigger-job/:secret', async (req, res) => {
    const { secret } = req.params;
    const JOB_SECRET = 'password'; // IMPORTANT: Create a long random string here
    if (secret !== JOB_SECRET) {
        return res.status(403).json({ message: 'Forbidden: Invalid secret key.' });
    }
    res.status(202).json({ message: 'Accepted: Job triggered successfully. Check server logs for progress.' });
    console.log('--- MANUAL JOB TRIGGERED ---');
    try {
        console.log('[1/2] Fetching hot products from RapidAPI...');
        await (0, product_discovery_service_1.fetchHotProductsFromRapidAPI)();
        console.log('[1/2] Fetching completed successfully.');
    }
    catch (error) {
        console.error('An error occurred during the manually triggered fetch job:', error);
    }
    finally {
        // THIS 'finally' BLOCK ENSURES ENRICHMENT ALWAYS RUNS
        console.log('[2/2] Starting product enrichment script...');
        (0, child_process_1.exec)('npm run enrich:products', (error, stdout, stderr) => {
            if (error) {
                console.error(`Enrichment script failed to execute: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Enrichment script stderr: ${stderr}`);
            }
            console.log(`Enrichment script stdout: \n${stdout}`);
            console.log('[2/2] Product enrichment script finished.');
            console.log('--- MANUAL JOB FINISHED ---');
        });
    }
});
// --- All your authenticated routes come AFTER the trigger endpoint ---
app.use('/api/auth', auth_routes_1.default);
// app.use('/api/content-creators', authMiddleware,contentCreatorRoutes);
app.use('/api/content-creators', auth_middleware_1.authMiddleware, hasMembership_middleware_1.hasMembershipMiddleware, content_creator_routes_1.default);
app.use('/api/profile', auth_middleware_1.authMiddleware, user_routes_1.default);
app.use('/api/payment', auth_middleware_1.authMiddleware, payment_routes_1.default);
app.use('/api/training', auth_middleware_1.authMiddleware, training_routes_1.default);
app.use('/api/winning-products', auth_middleware_1.authMiddleware, hasMembership_middleware_1.hasMembershipMiddleware, product_discovery_routes_1.default);
app.use('/api/dashboard', auth_middleware_1.authMiddleware, dashboard_routes_1.default);
app.use('/api/affiliate', auth_middleware_1.authMiddleware, affiliate_routes_1.default);
app.use('/api/admin', auth_middleware_1.authMiddleware, isAdmin_middleware_1.isAdminMiddleware, admin_routes_1.default);
node_cron_1.default.schedule('0 4 * * *', async () => {
    console.log('--- SCHEDULED JOB STARTING ---');
    try {
        console.log('[1/2] Fetching hot products from RapidAPI...');
        await (0, product_discovery_service_1.fetchHotProductsFromRapidAPI)();
        console.log('[1/2] Fetching completed successfully.');
    }
    catch (error) {
        console.error('An error occurred during the scheduled product fetch job:', error);
    }
    finally {
        // THIS 'finally' BLOCK ENSURES ENRICHMENT ALWAYS RUNS
        console.log('[2/2] Starting product enrichment script...');
        (0, child_process_1.exec)('npm run enrich:products', (error, stdout, stderr) => {
            if (error) {
                console.error(`Enrichment script failed to execute: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Enrichment script stderr: ${stderr}`);
            }
            console.log(`Enrichment script stdout: \n${stdout}`);
            console.log('[2/2] Product enrichment script finished.');
            console.log('--- SCHEDULED JOB BLOCK FINISHED ---');
        });
    }
});
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    // fetchHotProductsFromRapidAPI();
});
