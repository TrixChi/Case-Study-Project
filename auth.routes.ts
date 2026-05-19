import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase.js';
import { ApiResponse, AuthPayload } from '../types/index.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const { data: userRecord, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !userRecord) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, userRecord.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const payload: AuthPayload = {
      userId: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
      profileId: userRecord.profile_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: userRecord.id,
          email: userRecord.email,
          role: userRecord.role,
          firstName: userRecord.first_name,
          lastName: userRecord.last_name,
          profileId: userRecord.profile_id,
        },
      },
    } as ApiResponse);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
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

    // Check if user exists
    const { data: existing } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create profile record based on role
    let profileId: number | null = null;

    if (role === 'student') {
      const { data: student, error: sErr } = await supabase
        .from('student')
        .insert({ stuFirstName: firstName, stuLastName: lastName, stuContactInfo: '', address: '', status: 'active' })
        .select('studentID')
        .single();
      if (sErr) throw sErr;
      profileId = student.studentID;
    } else if (role === 'tutor') {
      const { data: tutor, error: tErr } = await supabase
        .from('tutor')
        .insert({ tutorFirstName: firstName, tutorLastName: lastName, specialization: '' })
        .select('tutorID')
        .single();
      if (tErr) throw tErr;
      profileId = tutor.tutorID;
    } else if (role === 'parent') {
      const { data: parent, error: pErr } = await supabase
        .from('parent')
        .insert({ parentFirstName: firstName, parentLastName: lastName, contactInfo: '', relationship: 'parent' })
        .select('parentID')
        .single();
      if (pErr) throw pErr;
      profileId = parent.parentID;
    } else if (role === 'admin') {
      const { data: staff, error: aErr } = await supabase
        .from('admin_staff')
        .insert({ staffFirstName: firstName, staffLastName: lastName, role: 'admin' })
        .select('staffID')
        .single();
      if (aErr) throw aErr;
      profileId = staff.staffID;
    }

    const { data: newUser, error: uErr } = await supabase
      .from('app_users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role,
        first_name: firstName,
        last_name: lastName,
        profile_id: profileId,
      })
      .select('id, email, role, first_name, last_name, profile_id')
      .single();

    if (uErr) throw uErr;

    return res.status(201).json({
      success: true,
      data: { user: newUser },
      message: 'Registration successful',
    } as ApiResponse);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
