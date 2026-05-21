import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ApiResponse, AuthPayload } from '../types/index';

const router = Router();

type RoleTableConfig = {
  table: string;
  role: 'student' | 'tutor' | 'parent' | 'admin';
  idField: string;
  passwordField: string;
  firstName: string;
  lastName: string;
};

const ROLE_TABLES: RoleTableConfig[] = [
  { table: 'student', role: 'student', idField: 'studentID', passwordField: 'encrypted_password', firstName: 'stuFirstName', lastName: 'stuLastName' },
  { table: 'tutor',   role: 'tutor',   idField: 'tutorID',   passwordField: 'encrypted_password', firstName: 'tutorFirstName', lastName: 'tutorLastName' },
  { table: 'parent',  role: 'parent',  idField: 'parentID',  passwordField: 'encrypted_password', firstName: 'parentFirstName', lastName: 'parentLastName' },
];

async function findUserByEmail(email: string): Promise<{
  record: Record<string, unknown>;
  config: RoleTableConfig;
} | null> {
  for (const config of ROLE_TABLES) {
    const { data } = await supabase
      .from(config.table)
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (data) return { record: data as Record<string, unknown>, config };
  }

  // Fallback: try app_users for admin accounts (may not exist)
  try {
    const { data } = await supabase
      .from('app_users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (data) {
      const appUser = data as Record<string, unknown>;
      return {
        record: appUser,
        config: {
          table: 'app_users',
          role: String(appUser.role ?? 'admin') as 'admin',
          idField: 'id',
          passwordField: 'password_hash',
          firstName: 'first_name',
          lastName: 'last_name',
        },
      };
    }
  } catch {
    // app_users table may not exist — ignore
  }

  return null;
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, error: 'JWT_SECRET not configured' });
    }

    const found = await findUserByEmail(email.toLowerCase().trim());

    if (!found) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const { record, config } = found;
    const storedHash = String(record[config.passwordField] ?? '');
    const passwordMatch = await bcrypt.compare(password, storedHash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const profileId = Number(record[config.idField]);

    const payload: AuthPayload = {
      userId: String(record[config.idField]),
      email: String(record.email),
      role: config.role,
      profileId,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: String(record[config.idField]),
          email: String(record.email),
          role: config.role,
          firstName: String(record[config.firstName] ?? ''),
          lastName: String(record[config.lastName] ?? ''),
          profileId,
        },
      },
    } as ApiResponse);
  } catch (err: unknown) {
    console.error('POST /auth/login failed:', err);
    return res.status(500).json({ success: false, error: (err as { message?: string })?.message || 'Server error' });
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

    const existing = await findUserByEmail(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Try to insert into app_users if it still exists
    try {
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
            id: (newUser as Record<string, unknown>).id,
            email: (newUser as Record<string, unknown>).email,
            role: (newUser as Record<string, unknown>).role,
            firstName: (newUser as Record<string, unknown>).first_name,
            lastName: (newUser as Record<string, unknown>).last_name,
            profileId: (newUser as Record<string, unknown>).profile_id,
          },
        },
        message: 'Registration successful',
      } as ApiResponse);
    } catch {
      return res.status(400).json({ success: false, error: 'Registration not supported — accounts are created by the admin' });
    }
  } catch (err: unknown) {
    console.error('POST /auth/register failed:', err);
    return res.status(500).json({ success: false, error: (err as { message?: string })?.message || 'Server error' });
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

    const found = await findUserByEmail(req.user.email);
    if (!found) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const { record, config } = found;
    const storedHash = String(record[config.passwordField] ?? '');
    const match = await bcrypt.compare(String(currentPassword), storedHash);
    if (!match) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(String(newPassword), 12);
    const { error: updateError } = await supabase
      .from(config.table)
      .update({ [config.passwordField]: newHash })
      .eq(config.idField, record[config.idField]);

    if (updateError) throw updateError;

    return res.json({ success: true, message: 'Password updated successfully' } as ApiResponse);
  } catch (err: unknown) {
    console.error('POST /auth/change-password failed:', err);
    return res.status(500).json({ success: false, error: (err as { message?: string })?.message || 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const found = await findUserByEmail(email.toLowerCase().trim());
    if (!found) {
      return res.status(404).json({ success: false, error: 'No account found with that email address' });
    }

    const { record, config } = found;
    const temporaryPassword = 'ABClearning2026';
    const newHash = await bcrypt.hash(temporaryPassword, 12);

    const { error: updateError } = await supabase
      .from(config.table)
      .update({ [config.passwordField]: newHash })
      .eq(config.idField, record[config.idField]);

    if (updateError) throw updateError;

    return res.json({
      success: true,
      data: { temporaryPassword },
      message: 'Password has been reset to the default password',
    });
  } catch (err: unknown) {
    console.error('POST /auth/forgot-password failed:', err);
    return res.status(500).json({ success: false, error: (err as { message?: string })?.message || 'Server error' });
  }
});

export default router;
