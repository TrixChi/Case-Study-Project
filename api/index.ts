import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function getUser(req: VercelRequest) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET!) as {
      userId: string; email: string; role: string; profileId: number;
    };
  } catch { return null; }
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = (req.query.path as string) || '';
  const segments = path.split('/').filter(Boolean);
  const module = segments[0]; // auth, enrollment, payment, records
  const sub = segments[1];    // login, register, students, grades, etc.
  const id = segments[2];     // optional :id

  try {
    // ── AUTH ──────────────────────────────────────────────
    if (module === 'auth') {

  if (sub === 'login' && req.method === 'POST') {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, error: 'Email and password required' });

    const normalized = email.toLowerCase().trim();

    const tables = [
      { table: 'admin_staff', role: 'admin',   idCol: 'staffID',   firstCol: 'staffFirstName', lastCol: 'staffLastName' },
      { table: 'tutor',       role: 'tutor',    idCol: 'tutorID',   firstCol: 'tutorFirstName', lastCol: 'tutorLastName' },
      { table: 'student',     role: 'student',  idCol: 'studentID', firstCol: 'stuFirstName',   lastCol: 'stuLastName' },
      { table: 'parent',      role: 'parent',   idCol: 'parentID',  firstCol: 'parentFirstName',lastCol: 'parentLastName' },
    ];

    let found: any = null;
    let foundConfig: typeof tables[0] | null = null;

    for (const cfg of tables) {
      const { data } = await supabase
        .from(cfg.table)
        .select('*')
        .ilike('email', normalized)
        .single();
      if (data) { found = data; foundConfig = cfg; break; }
    }

    if (!found || !foundConfig)
      return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, found.password_hash || '');
    if (!match)
      return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: String(found[foundConfig.idCol]), email: found.email,
        role: foundConfig.role, profileId: Number(found[foundConfig.idCol]) },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    return res.json({ success: true, data: { token, user: {
      id: String(found[foundConfig.idCol]),
      email: found.email,
      role: foundConfig.role,
      firstName: found[foundConfig.firstCol],
      lastName: found[foundConfig.lastCol],
      profileId: Number(found[foundConfig.idCol]),
    }}});
  }

  if (sub === 'register' && req.method === 'POST') {
    const { email, password, role, firstName, lastName } = req.body;
    if (!email || !password || !role || !firstName || !lastName)
      return res.status(400).json({ success: false, error: 'All fields required' });

    const tables: Record<string, { table: string; idCol: string; firstCol: string; lastCol: string; extra: Record<string, unknown> }> = {
      admin:   { table: 'admin_staff', idCol: 'staffID',   firstCol: 'staffFirstName', lastCol: 'staffLastName',  extra: { role: 'admin' } },
      tutor:   { table: 'tutor',       idCol: 'tutorID',   firstCol: 'tutorFirstName', lastCol: 'tutorLastName',   extra: { specialization: '' } },
      student: { table: 'student',     idCol: 'studentID', firstCol: 'stuFirstName',   lastCol: 'stuLastName',     extra: { stuContactInfo: '', address: '', status: 'active' } },
      parent:  { table: 'parent',      idCol: 'parentID',  firstCol: 'parentFirstName',lastCol: 'parentLastName',  extra: { contactInfo: '', relationship: 'parent' } },
    };

    const cfg = tables[role];
    if (!cfg) return res.status(400).json({ success: false, error: 'Invalid role' });

    const hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from(cfg.table)
      .insert({ email: email.toLowerCase(), password_hash: hash,
        [cfg.firstCol]: firstName, [cfg.lastCol]: lastName, ...cfg.extra })
      .select('*').single();

    if (error) throw error;

    return res.status(201).json({ success: true, data: { user: {
      id: String(data[cfg.idCol]), email: data.email, role,
      firstName: data[cfg.firstCol], lastName: data[cfg.lastCol],
      profileId: Number(data[cfg.idCol]),
    }}, message: 'Registration successful' });
  }

  if (sub === 'change-password' && req.method === 'POST') {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, error: 'Both passwords required' });
    if (String(newPassword).length < 8)
      return res.status(400).json({ success: false, error: 'Min 8 characters' });

    const tableMap: Record<string, { table: string; idCol: string }> = {
      admin:   { table: 'admin_staff', idCol: 'staffID' },
      tutor:   { table: 'tutor',       idCol: 'tutorID' },
      student: { table: 'student',     idCol: 'studentID' },
      parent:  { table: 'parent',      idCol: 'parentID' },
    };
    const cfg = tableMap[user.role];
    if (!cfg) return res.status(400).json({ success: false, error: 'Invalid role' });

    const { data: record } = await supabase
      .from(cfg.table).select('password_hash').eq(cfg.idCol, user.profileId).single();
    if (!record) return res.status(404).json({ success: false, error: 'Account not found' });

    const match = await bcrypt.compare(String(currentPassword), record.password_hash || '');
    if (!match) return res.status(400).json({ success: false, error: 'Current password incorrect' });

    const newHash = await bcrypt.hash(String(newPassword), 12);
    const { error } = await supabase
      .from(cfg.table).update({ password_hash: newHash }).eq(cfg.idCol, user.profileId);
    if (error) throw error;

    return res.json({ success: true, message: 'Password updated' });
  }
}

    // ── Require auth for everything below ─────────────────
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    // ── ENROLLMENT ────────────────────────────────────────
    if (module === 'enrollment') {

      if (!sub && req.method === 'GET') {
        let query = supabase.from('enrollment')
          .select('*, student(studentID,stuFirstName,stuLastName), subject(subjectID,subjectName,units,tutorID, tutor(tutorFirstName,tutorLastName))')
          .order('enrollmentDate', { ascending: false });
        if (user.role === 'student') query = query.eq('studentID', user.profileId);
        if (user.role === 'parent') {
          const { data: kids } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
          const ids = (kids || []).map((s: any) => s.studentID);
          query = query.in('studentID', ids.length ? ids : [0]);
        }
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (!sub && req.method === 'POST') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { studentID, subjectID } = req.body;
        const { data, error } = await supabase.from('enrollment')
          .insert({ studentID, subjectID, enrollmentDate: new Date().toISOString(), status: 'pending' })
          .select('*, student(*), subject(*)').single();
        if (error) throw error;
        return res.status(201).json({ success: true, data });
      }

      if (sub && id === 'status' && req.method === 'PATCH') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { status } = req.body;
        const { data, error } = await supabase.from('enrollment')
          .update({ status, validatedBy: user.profileId })
          .eq('enrollmentID', sub).select('*, student(*), subject(*)').single();
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('enrollment').delete().eq('enrollmentID', sub);
        if (error) throw error;
        return res.json({ success: true, message: 'Deleted' });
      }
    }

    // ── PAYMENT ───────────────────────────────────────────
    if (module === 'payment') {

      if (!sub && req.method === 'GET') {
        if (user.role === 'tutor') return res.status(403).json({ success: false, error: 'Forbidden' });
        let query = supabase.from('payment')
          .select('*, student(studentID,stuFirstName,stuLastName)')
          .order('paymentDate', { ascending: false });
        if (user.role === 'student') query = query.eq('studentID', user.profileId);
        if (user.role === 'parent') {
          const { data: kids } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
          const ids = (kids || []).map((s: any) => s.studentID);
          query = query.in('studentID', ids.length ? ids : [0]);
        }
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (!sub && req.method === 'POST') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { studentID, amount, receiptNo } = req.body;
        const { data: last } = await supabase.from('payment').select('balance')
          .eq('studentID', studentID).order('paymentDate', { ascending: false }).limit(1).single();
        const newBalance = Math.max(0, Number(last?.balance ?? 0) - Number(amount));
        const { data, error } = await supabase.from('payment')
          .insert({ studentID, amount: Number(amount), paymentDate: new Date().toISOString(),
            receiptNo: receiptNo || `RCT-${Date.now()}`, balance: newBalance })
          .select('*, student(studentID,stuFirstName,stuLastName)').single();
        if (error) throw error;
        return res.status(201).json({ success: true, data });
      }

      if (sub && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('payment').delete().eq('paymentID', sub);
        if (error) throw error;
        return res.json({ success: true, message: 'Deleted' });
      }
    }

    // ── RECORDS ───────────────────────────────────────────
    if (module === 'records') {

      // Students
      if (sub === 'students' && req.method === 'GET') {
        let query = supabase.from('student').select('*, parent(parentFirstName,parentLastName,contactInfo,relationship)');
        if (user.role === 'student') query = query.eq('studentID', user.profileId);
        else if (user.role === 'parent') query = query.eq('parentID', user.profileId);
        else query = query.order('stuLastName');
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'students' && req.method === 'POST') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { data, error } = await supabase.from('student').insert(req.body).select().single();
        if (error) throw error;
        return res.status(201).json({ success: true, data });
      }

      if (sub === 'students' && id && req.method === 'PATCH') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { data, error } = await supabase.from('student').update(req.body).eq('studentID', id).select().single();
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'students' && id && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('student').delete().eq('studentID', id);
        if (error) throw error;
        return res.json({ success: true, message: 'Deleted' });
      }

      // Subjects
      if (sub === 'subjects' && req.method === 'GET') {
        const { data, error } = await supabase.from('subject')
          .select('*, tutor(tutorFirstName,tutorLastName,specialization)').order('subjectName');
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'subjects' && req.method === 'POST') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { data, error } = await supabase.from('subject').insert(req.body).select().single();
        if (error) throw error;
        return res.status(201).json({ success: true, data });
      }

      if (sub === 'subjects' && id && req.method === 'PATCH') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { data, error } = await supabase.from('subject').update(req.body).eq('subjectID', id).select().single();
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'subjects' && id && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('subject').delete().eq('subjectID', id);
        if (error) throw error;
        return res.json({ success: true, message: 'Deleted' });
      }

      // Grades
      if (sub === 'grades' && req.method === 'GET') {
        let query = supabase.from('grade')
          .select('*, student(stuFirstName,stuLastName), subject(subjectName,units), tutor(tutorFirstName,tutorLastName)')
          .order('gradeID', { ascending: false });
        if (user.role === 'student') query = query.eq('studentID', user.profileId);
        else if (user.role === 'parent') {
          const { data: kids } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
          const ids = (kids || []).map((s: any) => s.studentID);
          query = query.in('studentID', ids.length ? ids : [0]);
        } else if (user.role === 'tutor') query = query.eq('tutorID', user.profileId);
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'grades' && req.method === 'POST') {
        if (user.role !== 'admin' && user.role !== 'tutor')
          return res.status(403).json({ success: false, error: 'Forbidden' });
        const { studentID, subjectID, gradeValue, tutorID } = req.body;
        const standing = Number(gradeValue) >= 75 ? 'Passed' : 'Failed';
        const { data, error } = await supabase.from('grade')
          .insert({ studentID, subjectID, gradeValue: Number(gradeValue),
            academicStanding: standing, tutorID: user.role === 'tutor' ? user.profileId : tutorID })
          .select('*, student(stuFirstName,stuLastName), subject(subjectName)').single();
        if (error) throw error;
        return res.status(201).json({ success: true, data });
      }

      if (sub === 'grades' && id && req.method === 'PATCH') {
        if (user.role !== 'admin' && user.role !== 'tutor')
          return res.status(403).json({ success: false, error: 'Forbidden' });
        const updates: any = { ...req.body };
        if (updates.gradeValue) updates.academicStanding = Number(updates.gradeValue) >= 75 ? 'Passed' : 'Failed';
        const { data, error } = await supabase.from('grade').update(updates).eq('gradeID', id).select().single();
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'grades' && id && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('grade').delete().eq('gradeID', id);
        if (error) throw error;
        return res.json({ success: true, message: 'Deleted' });
      }

      // Attendance
      if (sub === 'attendance' && req.method === 'GET') {
        let query = supabase.from('attendance')
          .select('*, student(stuFirstName,stuLastName), tutor(tutorFirstName,tutorLastName)')
          .order('attendanceDate', { ascending: false });
        if (user.role === 'student') query = query.eq('studentID', user.profileId);
        else if (user.role === 'parent') {
          const { data: kids } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
          const ids = (kids || []).map((s: any) => s.studentID);
          query = query.in('studentID', ids.length ? ids : [0]);
        } else if (user.role === 'tutor') query = query.eq('tutorID', user.profileId);
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'attendance' && req.method === 'POST') {
        if (user.role !== 'admin' && user.role !== 'tutor')
          return res.status(403).json({ success: false, error: 'Forbidden' });
        const { studentID, subjectID, status, attendanceDate } = req.body;
        const { data, error } = await supabase.from('attendance')
          .insert({ studentID, subjectID, status: status || 'present',
            attendanceDate: attendanceDate || new Date().toISOString(),
            tutorID: user.role === 'tutor' ? user.profileId : req.body.tutorID })
          .select('*, student(stuFirstName,stuLastName)').single();
        if (error) throw error;
        return res.status(201).json({ success: true, data });
      }

      if (sub === 'attendance' && id && req.method === 'PATCH') {
        if (user.role !== 'admin' && user.role !== 'tutor')
          return res.status(403).json({ success: false, error: 'Forbidden' });
        const { data, error } = await supabase.from('attendance').update(req.body).eq('attendanceID', id).select().single();
        if (error) throw error;
        return res.json({ success: true, data });
      }

      if (sub === 'attendance' && id && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('attendance').delete().eq('attendanceID', id);
        if (error) throw error;
        return res.json({ success: true, message: 'Deleted' });
      }

      // Tutors
      if (sub === 'tutors' && req.method === 'GET') {
        const { data, error } = await supabase.from('tutor').select('*').order('tutorLastName');
        if (error) throw error;
        return res.json({ success: true, data });
      }

      // Parents
      if (sub === 'parents' && req.method === 'GET') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { data, error } = await supabase.from('parent').select('*').order('parentLastName');
        if (error) throw error;
        return res.json({ success: true, data });
      }
    }

    return res.status(404).json({ success: false, error: 'Route not found' });

  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
}