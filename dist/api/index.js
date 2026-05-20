"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_js_1 = __importDefault(require("../src/routes/auth.js"));
const enrollment_js_1 = __importDefault(require("../src/routes/enrollment.js"));
const payment_js_1 = __importDefault(require("../src/routes/payment.js"));
const records_js_1 = __importDefault(require("../src/routes/records.js"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Startup log to help diagnose cold-start issues on Vercel
console.log('[api/index] handler loaded at', new Date().toISOString());
// Allow all origins in production — Vercel frontend and backend share the same domain,
// so CORS isn't needed for same-origin, but allow it for flexibility / custom domains.
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/auth', auth_js_1.default);
app.use('/api/enrollment', enrollment_js_1.default);
app.use('/api/payment', payment_js_1.default);
app.use('/api/records', records_js_1.default);
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});
// Export the Express app directly so Vercel uses the Node handler without extra wrappers
exports.default = app;
//# sourceMappingURL=index.js.map