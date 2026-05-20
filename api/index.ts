import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import serverless from 'serverless-http';

import authRoutes from '../src/routes/auth.js';
import enrollmentRoutes from '../src/routes/enrollment.js';
import paymentRoutes from '../src/routes/payment.js';
import recordsRoutes from '../src/routes/records.js';

dotenv.config();

const app = express();

// Allow all origins in production — Vercel frontend and backend share the same domain,
// so CORS isn't needed for same-origin, but allow it for flexibility / custom domains.
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/records', recordsRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

export default serverless(app);