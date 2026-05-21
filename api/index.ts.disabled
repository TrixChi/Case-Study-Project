import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import serverless from 'serverless-http';

import authRoutes from '../src/routes/auth';
import enrollmentRoutes from '../src/routes/enrollment';
import paymentRoutes from '../src/routes/payment';
import recordsRoutes from '../src/routes/records';

dotenv.config();

const app = express();

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/env-check', (_req, res) => {
  res.json({
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasJwtSecret: !!process.env.JWT_SECRET,
    supabaseUrlStart: process.env.SUPABASE_URL?.substring(0, 30),
  });
});

app.use(cors({ origin: true, credentials: true }));
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