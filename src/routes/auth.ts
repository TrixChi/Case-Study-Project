import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ApiResponse, AuthPayload } from '../types/index';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const { data: user, error } = await supabase
      .from('app_users')
      .select('*')
      .ilike('email', email.toLowerCase().trim())
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, error: 'JWT_SECRET not configured' });
    }

    const payload: AuthPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      profileId: user.profile_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.first_name,
          lastName: user.last_name,
          profileId: user.profile_id,
        },
      },
    } as ApiResponse);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, role, firstName, lastName, profileId } = req.body;
    if (!email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }

    const validRoles = ['admin', 'tutor', 'student', 'parent'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const { data: existing } = await supabase
      .from('app_users')
      .select('id')
      .ilike('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: newUser, error } = await supabase
      .from('app_users')
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        role,
        first_name: firstName,
        last_name: lastName,
        profile_id: profileId ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          profileId: newUser.profile_id,
        },
      },
      message: 'Registration successful',
    } as ApiResponse);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both passwords required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }

    const { data: user, error } = await supabase
      .from('app_users')
      .select('password_hash')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const match = await bcrypt.compare(String(currentPassword), user.password_hash);
    if (!match) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(String(newPassword), 12);
    const { error: updateError } = await supabase
      .from('app_users')
      .update({ password_hash: newHash })
      .eq('id', req.user.userId);

    if (updateError) throw updateError;

    return res.json({ success: true, message: 'Password updated successfully' } as ApiResponse);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

export default router;