import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ApiResponse, AuthPayload } from '../types/index';

const router = Router();

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Tokens cannot be signed without it.');
}

type AuthTableConfig = {
  table: 'admin_staff' | 'tutor' | 'student' | 'parent';
  role: AuthPayload['role'];
  idColumn: string;
  firstNameColumn: string;
  lastNameColumn: string;
};

const AUTH_TABLES: AuthTableConfig[] = [
  { table: 'admin_staff', role: 'admin', idColumn: 'staffID', firstNameColumn: 'staffFirstName', lastNameColumn: 'staffLastName' },
  { table: 'tutor', role: 'tutor', idColumn: 'tutorID', firstNameColumn: 'tutorFirstName', lastNameColumn: 'tutorLastName' },
  { table: 'student', role: 'student', idColumn: 'studentID', firstNameColumn: 'stuFirstName', lastNameColumn: 'stuLastName' },
  { table: 'parent', role: 'parent', idColumn: 'parentID', firstNameColumn: 'parentFirstName', lastNameColumn: 'parentLastName' },
];

async function findUserByEmail(email: string) {
  const normalizedEmail = email.toLowerCase().trim();

  for (const config of AUTH_TABLES) {
    const { data, error } = await supabase
      .from(config.table)
      .select('*')
      .ilike('email', normalizedEmail)
      .single();

    if (data) {
      return { config, record: data as unknown as Record<string, unknown> };
    }

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
  }

  return null;
}

async function updatePasswordByEmail(email: string, passwordHash: string) {
  const normalizedEmail = email.toLowerCase().trim();

  for (const config of AUTH_TABLES) {
    const { data, error } = await supabase
      .from(config.table)
      .update({ encrypted_password: passwordHash })
      .ilike('email', normalizedEmail)
      .select(config.idColumn)
      .single();

    if (data) {
      return { config, record: data as unknown as Record<string, unknown> };
    }

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
  }

  return null;
}

function getPasswordValue(record: Record<string, unknown>) {
  const encryptedPassword = record.encrypted_password;
  const passwordHash = record.password_hash;

  if (typeof encryptedPassword === 'string') {
    return encryptedPassword;
  }

  if (typeof passwordHash === 'string') {
    return passwordHash;
  }

  return null;
}

function getTableConfigByRole(role: AuthPayload['role']) {
  return AUTH_TABLES.find((item) => item.role === role) || null;
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const lookup = await findUserByEmail(email);

    if (!lookup) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const { config, record } = lookup;
    const passwordValue = getPasswordValue(record);

    if (!passwordValue) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, passwordValue);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const profileId = Number(record[config.idColumn] ?? 0);
    const firstName = String(record[config.firstNameColumn] ?? '');
    const lastName = String(record[config.lastNameColumn] ?? '');

    const payload: AuthPayload = {
      userId: String(profileId || record[config.idColumn] || email.toLowerCase()),
      email: String(record.email ?? email.toLowerCase()),
      role: config.role,
      profileId,
    };

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not set when attempting to sign token');
      return res.status(500).json({ success: false, error: 'JWT_SECRET not set' });
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: String(profileId || record[config.idColumn] || email.toLowerCase()),
          email: String(record.email ?? email.toLowerCase()),
          role: config.role,
          firstName,
          lastName,
          profileId,
        },
      },
    } as ApiResponse);
  } catch (err: any) {
    console.error(err);
    const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
    return res.status(500).json({ success: false, error: devMessage });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await findUserByEmail(normalizedEmail);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'No account found for that email' });
    }

    const temporaryPassword = randomBytes(4).toString('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const updated = await updatePasswordByEmail(normalizedEmail, passwordHash);

    if (!updated) {
      return res.status(500).json({ success: false, error: 'Unable to reset password' });
    }

    return res.json({
      success: true,
      message: 'Password reset successfully',
      data: { temporaryPassword },
    } as ApiResponse);
  } catch (err: any) {
    console.error(err);
    const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
    return res.status(500).json({ success: false, error: devMessage });
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
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }

    const tableConfig = getTableConfigByRole(req.user.role);
    if (!tableConfig) {
      return res.status(400).json({ success: false, error: 'Invalid account role' });
    }

    const { data: record, error: fetchError } = await supabase
      .from(tableConfig.table)
      .select('*')
      .eq(tableConfig.idColumn, req.user.profileId)
      .single();

    if (fetchError || !record) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const passwordValue = getPasswordValue(record as Record<string, unknown>);
    if (!passwordValue) {
      return res.status(500).json({ success: false, error: 'Stored password not found' });
    }

    const passwordMatch = await bcrypt.compare(String(currentPassword), passwordValue);
    if (!passwordMatch) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    const { error: updateError } = await supabase
      .from(tableConfig.table)
      .update({ encrypted_password: passwordHash })
      .eq(tableConfig.idColumn, req.user.profileId);

    if (updateError) {
      throw updateError;
    }

    return res.json({ success: true, message: 'Password updated successfully' } as ApiResponse);
  } catch (err: any) {
    console.error(err);
    const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
    return res.status(500).json({ success: false, error: devMessage });
  }
});

// POST /api/auth/register (admin only in production, open for setup)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, role, firstName, lastName } = req.body;
    if (!email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }

    const validRoles = ['admin', 'tutor', 'student', 'parent'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const existing = await findUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const tableConfig = AUTH_TABLES.find((item) => item.role === role);
    if (!tableConfig) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const insertPayload: Record<string, unknown> = {
      email: email.toLowerCase(),
      encrypted_password: passwordHash,
    };

    insertPayload[tableConfig.firstNameColumn] = firstName;
    insertPayload[tableConfig.lastNameColumn] = lastName;

    if (role === 'admin') {
      insertPayload.role = 'admin';
    }

    if (role === 'student') {
      insertPayload.stuContactInfo = '';
      insertPayload.address = '';
      insertPayload.status = 'active';
    }

    if (role === 'tutor') {
      insertPayload.specialization = '';
    }

    if (role === 'parent') {
      insertPayload.contactInfo = '';
      insertPayload.relationship = 'parent';
    }

    const { data: createdRecord, error: uErr } = await supabase
      .from(tableConfig.table)
      .insert(insertPayload)
      .select('*')
      .single();

    if (uErr) throw uErr;

    const created = createdRecord as Record<string, unknown>;
    const profileId = Number(created[tableConfig.idColumn] ?? 0);

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: String(profileId || created[tableConfig.idColumn] || email.toLowerCase()),
          email: String(created.email ?? email.toLowerCase()),
          role,
          firstName: String(created[tableConfig.firstNameColumn] ?? firstName),
          lastName: String(created[tableConfig.lastNameColumn] ?? lastName),
          profileId,
        },
      },
      message: 'Registration successful',
    } as ApiResponse);
  } catch (err: any) {
    console.error(err);
    const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
    return res.status(500).json({ success: false, error: devMessage });
  }
});

export default router;
