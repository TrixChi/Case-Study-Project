import type { AuthPayload } from '../types/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthPayload;
  }
}
