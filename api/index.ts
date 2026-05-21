import express from 'express';
import serverless from 'serverless-http';

const app = express();
app.use(express.json());

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', (_req, res) => {
  res.json({ ok: true, message: 'stub login reached' });
});

export default serverless(app);