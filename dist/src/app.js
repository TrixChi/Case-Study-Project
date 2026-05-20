"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const index_js_1 = __importDefault(require("./modules/enrollment/index.js"));
const index_js_2 = __importDefault(require("./modules/payment/index.js"));
const index_js_3 = __importDefault(require("./modules/records/index.js"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Log app initialization to help diagnose cold-start issues
console.log('[src/app] Express app initialized at', new Date().toISOString());
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://your-frontend-domain.com']
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Routes
app.use('/api/auth', auth_js_1.default);
app.use('/api/enrollment', index_js_1.default);
app.use('/api/payment', index_js_2.default);
app.use('/api/records', index_js_3.default);
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});
exports.default = app;
//# sourceMappingURL=app.js.map