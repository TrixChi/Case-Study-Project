"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
function handler(_req, res) {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
//# sourceMappingURL=health.js.map