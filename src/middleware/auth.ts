import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload, UserRole } from '../types/index.js';

// Re-export from the canonical root-level auth middleware
export { authenticate, authorize } from '../../auth.middleware';
export type { AuthRequest } from '../../auth.middleware';
