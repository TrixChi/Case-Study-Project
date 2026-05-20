import serverless from 'serverless-http';
import app from '../src/app.js';

// Wrap Express app with serverless-http so Vercel can run it as a function
export default serverless(app);
