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
  const module = segments[0]; // auth, enrollment, enlistment, payment, records
  const sub = segments[1];    // login, register, students, grades, etc.
  const id = segments[2];     // optional :id
  const extra = segments[3];  // optional sub-action (validate, status, release, etc.)

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

  if (sub === 'forgot-password' && req.method === 'POST') {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, error: 'Email is required' });

    const normalized = email.toLowerCase().trim();

    const tables = [
      { table: 'admin_staff', idCol: 'staffID' },
      { table: 'tutor',       idCol: 'tutorID' },
      { table: 'student',     idCol: 'studentID' },
      { table: 'parent',      idCol: 'parentID' },
    ];

    let found: any = null;
    let foundConfig: typeof tables[0] | null = null;

    for (const cfg of tables) {
      const { data } = await supabase
        .from(cfg.table)
        .select('*')
        .ilike('email', normalized)
        .maybeSingle();
      if (data) { found = data; foundConfig = cfg; break; }
    }

    if (!found || !foundConfig)
      return res.status(404).json({ success: false, error: 'No account found with that email address' });

    const temporaryPassword = 'ABClearning2026';
    const newHash = await bcrypt.hash(temporaryPassword, 12);

    const { error: updateError } = await supabase
      .from(foundConfig.table)
      .update({ password_hash: newHash })
      .eq(foundConfig.idCol, found[foundConfig.idCol]);
    if (updateError) throw updateError;

    return res.json({
      success: true,
      data: { temporaryPassword },
      message: 'Password has been reset to the default password',
    });
  }
}

    // ── Require auth for everything below ─────────────────
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    // ── ENROLLMENT ────────────────────────────────────────
    if (module === 'enrollment') {

      if (!sub && req.method === 'GET') {
        let query = supabase.from('enrollment')
          .select('*, student(studentID,stuFirstName,stuLastName), subject(subjectID,subjectName,units,fee,tutorID, tutor(tutorFirstName,tutorLastName))')
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
        if (!['approved', 'rejected', 'pending'].includes(status))
          return res.status(400).json({ success: false, error: 'Invalid status' });

        // Fetch current state before updating so we know prev status and fee
        const { data: current, error: fetchErr } = await supabase.from('enrollment')
          .select('status, studentID, subject(fee)')
          .eq('enrollmentID', sub).single();
        if (fetchErr) throw fetchErr;

        const { data, error } = await supabase.from('enrollment')
          .update({ status, validatedBy: user.profileId })
          .eq('enrollmentID', sub)
          .select('*, student(studentID,stuFirstName,stuLastName), subject(subjectID,subjectName,units,fee,tutor(tutorFirstName,tutorLastName))').single();
        if (error) throw error;

        // Sync overdueFees on the student
        const subjectFee = Number((current as any)?.subject?.fee || 0);
        const prevStatus = (current as any)?.status;
        const studentID = (current as any)?.studentID;
        if (subjectFee > 0 && studentID) {
          const { data: stu } = await supabase.from('student').select('overdueFees').eq('studentID', studentID).single();
          const cur = Number((stu as any)?.overdueFees || 0);
          if (status === 'approved' && prevStatus !== 'approved') {
            await supabase.from('student').update({ overdueFees: cur + subjectFee, status: 'missing fees' }).eq('studentID', studentID);
          } else if (prevStatus === 'approved' && status !== 'approved') {
            const next = Math.max(0, cur - subjectFee);
            await supabase.from('student').update({ overdueFees: next }).eq('studentID', studentID);
          }
        }

        return res.json({ success: true, data, message: `Enrollment ${status}` });
      }

      if (sub && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('enrollment').delete().eq('enrollmentID', sub);
        if (error) throw error;
        return res.json({ success: true, message: 'Deleted' });
      }
    }

    // ── ENLISTMENT ────────────────────────────────────────
    if (module === 'enlistment') {

      if (!sub && req.method === 'GET') {
        let query = supabase.from('enlistment')
          .select('*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName, units, fee, tutor(tutorFirstName, tutorLastName))')
          .order('enlistmentDate', { ascending: false });
        if (user.role === 'student') query = query.eq('studentID', user.profileId);
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, data });
      }

      // POST — student submits one or more subjects; inserts 1 row per subject
      if (!sub && req.method === 'POST') {
        if (user.role !== 'student') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { subjectIDs } = req.body;
        if (!Array.isArray(subjectIDs) || subjectIDs.length === 0)
          return res.status(400).json({ success: false, error: 'At least one subjectID is required' });

        const enlistmentDate = new Date().toISOString();
        const created: any[] = [];
        const skipped: number[] = [];

        for (const raw of subjectIDs) {
          const sid = Number(raw);
          const { data: existing } = await supabase.from('enlistment').select('enlistmentID')
            .eq('studentID', user.profileId).eq('subjectID', sid).in('status', ['pending', 'approved']).maybeSingle();
          if (existing) { skipped.push(sid); continue; }
          const { data: passed } = await supabase.from('grade').select('gradeID')
            .eq('studentID', user.profileId).eq('subjectID', sid).eq('academicStanding', 'Passed').maybeSingle();
          if (passed) { skipped.push(sid); continue; }
          const { data, error } = await supabase.from('enlistment')
            .insert({ studentID: user.profileId, subjectID: sid, enlistmentDate, status: 'pending' })
            .select('*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName)').single();
          if (error) throw error;
          created.push(data);
        }

        if (created.length === 0)
          return res.status(409).json({ success: false, error: 'Already enlisted in all selected subjects' });
        return res.status(201).json({
          success: true, data: created,
          message: `${created.length} enlistment(s) submitted${skipped.length > 0 ? `, ${skipped.length} already enlisted` : ''}`,
        });
      }

      // PATCH /:id/status — admin approves or rejects
      if (sub && id === 'status' && req.method === 'PATCH') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { status } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status))
          return res.status(400).json({ success: false, error: 'Invalid status' });
        const { data, error } = await supabase.from('enlistment')
          .update({ status, validatedBy: user.profileId, validatedAt: new Date().toISOString() })
          .eq('enlistmentID', sub)
          .select('*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName)').single();
        if (error) throw error;
        if (status === 'approved' && data) {
          const { data: existing } = await supabase.from('enrollment').select('enrollmentID')
            .eq('studentID', (data as any).studentID).eq('subjectID', (data as any).subjectID).maybeSingle();
          if (!existing) {
            await supabase.from('enrollment').insert({
              studentID: (data as any).studentID, subjectID: (data as any).subjectID,
              enrollmentDate: new Date().toISOString(), status: 'approved',
            });
          }
        }
        return res.json({ success: true, data, message: `Enlistment ${status}` });
      }

      // DELETE /:id
      if (sub && !id && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('enlistment').delete().eq('enlistmentID', sub);
        if (error) throw error;
        return res.json({ success: true, message: 'Enlistment deleted' });
      }
    }

    // ── PAYMENT ───────────────────────────────────────────
    if (module === 'payment') {

      // GET /payment/summary — missing fees stat for dashboard
      if (sub === 'summary' && req.method === 'GET') {
        if (user.role === 'tutor') return res.json({ success: true, data: { totals: { missingFees: 0 }, students: [] } });
        let query = supabase.from('student').select('studentID, stuFirstName, stuLastName, status, overdueFees');
        if (user.role === 'student') query = query.eq('studentID', user.profileId);
        else if (user.role === 'parent') query = query.eq('parentID', user.profileId);
        const { data: allStudents, error: sErr } = await query;
        if (sErr) throw sErr;
        const withFees = (allStudents || []).filter((s: any) => s.status === 'missing fees' || Number(s.overdueFees) > 0);
        const totalMissingFees = withFees.reduce((sum: number, s: any) => sum + Number(s.overdueFees || 0), 0);
        return res.json({
          success: true,
          data: {
            totals: { missingFees: totalMissingFees },
            students: withFees.map((s: any) => ({
              studentID: s.studentID,
              stuFirstName: s.stuFirstName,
              stuLastName: s.stuLastName,
              missingFees: Number(s.overdueFees || 0),
              subjects: [],
            })),
          },
        });
      }

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
  let query = supabase.from('student').select('*');
  if (user.role === 'student') query = query.eq('studentID', user.profileId);
  else if (user.role === 'parent') query = query.eq('parentID', user.profileId);
  else query = query.order('stuLastName');
  
  const { data: students, error } = await query;
  if (error) throw error;

  // Manually fetch parent info
  const parentIDs = [...new Set(students.filter((s: any) => s.parentID).map((s: any) => s.parentID))];
  let parentsMap: Record<number, any> = {};
  
  if (parentIDs.length > 0) {
    const { data: parents } = await supabase
      .from('parent')
      .select('parentID, parentFirstName, parentLastName, contactInfo, relationshipStatus')
      .in('parentID', parentIDs);
    if (parents) {
      parentsMap = Object.fromEntries(parents.map((p: any) => [p.parentID, p]));
    }
  }

  const result = students.map((s: any) => ({
    ...s,
    parent: parentsMap[s.parentID] || null,
  }));

  return res.json({ success: true, data: result });
}

      if (sub === 'students' && req.method === 'POST') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { email, password, stuFirstName, stuMiddleName, stuLastName, stuContactInfo, address, status, parentID, overdueFees } = req.body;
        if (!stuFirstName || !stuLastName)
          return res.status(400).json({ success: false, error: 'stuFirstName and stuLastName are required' });
        const normalizedEmail = String(email || '').toLowerCase().trim() ||
          `${String(stuLastName).toLowerCase().replace(/\s+/g, '')}.${String(stuFirstName).toLowerCase().replace(/\s+/g, '')}@student.abclearning.com`;
        const passwordHash = await bcrypt.hash(String(password || '').trim() || 'ABClearning2026', 12);
        const insertPayload: Record<string, unknown> = {
          email: normalizedEmail,
          password_hash: passwordHash,
          stuFirstName,
          stuMiddleName: stuMiddleName || '',
          stuLastName,
          stuContactInfo: stuContactInfo || '',
          address: address || '',
          status: status || 'enrolled',
        };
        if (parentID) insertPayload.parentID = Number(parentID);
        if (overdueFees !== '' && overdueFees != null) insertPayload.overdueFees = Number(overdueFees);
        const { data, error } = await supabase.from('student').insert(insertPayload).select().single();
        if (error) throw error;
        return res.status(201).json({ success: true, data });
      }

      if (sub === 'students' && id && req.method === 'PATCH') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { password, email, stuFirstName, stuMiddleName, stuLastName, stuContactInfo, address, status, parentID, overdueFees } = req.body;
        const updates: Record<string, unknown> = {};
        if (email) updates.email = String(email).toLowerCase();
        if (stuFirstName !== undefined) updates.stuFirstName = stuFirstName;
        if (stuMiddleName !== undefined) updates.stuMiddleName = stuMiddleName || '';
        if (stuLastName !== undefined) updates.stuLastName = stuLastName;
        if (stuContactInfo !== undefined) updates.stuContactInfo = stuContactInfo;
        if (address !== undefined) updates.address = address;
        if (status !== undefined) updates.status = status;
        if ('parentID' in req.body) updates.parentID = parentID ? Number(parentID) : null;
        if (overdueFees !== '' && overdueFees != null) updates.overdueFees = Number(overdueFees);
        if (password) updates.password_hash = await bcrypt.hash(String(password), 12);
        const { data, error } = await supabase.from('student').update(updates).eq('studentID', id).select().single();
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
          .select('*, student(stuFirstName,stuLastName), subject(subjectName), tutor(tutorFirstName,tutorLastName)')
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

// ADD THESE:
if (sub === 'tutors' && req.method === 'POST') {
  if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
  const { tutorFirstName, tutorLastName, specialization, email, password } = req.body;
  const hash = password ? await bcrypt.hash(password, 12) : null;
  const { data, error } = await supabase.from('tutor')
    .insert({ tutorFirstName, tutorLastName, specialization: specialization || '',
      email: email?.toLowerCase() || null, password_hash: hash, status: 'active' })
    .select('*').single();
  if (error) throw error;
  return res.status(201).json({ success: true, data });
}

if (sub === 'tutors' && id && req.method === 'PATCH') {
  if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
  const { password, email, tutorFirstName, tutorLastName, specialization, status } = req.body;
  const updates: any = {};
  if (tutorFirstName !== undefined) updates.tutorFirstName = tutorFirstName;
  if (tutorLastName !== undefined) updates.tutorLastName = tutorLastName;
  if (specialization !== undefined) updates.specialization = specialization;
  if (status !== undefined) updates.status = status;
  if (email) updates.email = String(email).toLowerCase();
  if (password) updates.password_hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('tutor').update(updates).eq('tutorID', id).select().single();
  if (error) throw error;
  return res.json({ success: true, data });
}

if (sub === 'tutors' && id && req.method === 'DELETE') {
  if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
  const { error } = await supabase.from('tutor').delete().eq('tutorID', id);
  if (error) throw error;
  return res.json({ success: true, message: 'Deleted' });
}

      // Parents — GET list
      if (sub === 'parents' && !id && req.method === 'GET') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { data, error } = await supabase.from('parent').select('*').order('parentLastName');
        if (error) throw error;
        return res.json({ success: true, data });
      }

      // Parents — POST (admin creates)
      if (sub === 'parents' && !id && req.method === 'POST') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { email, password, parentFirstName, parentMiddleName, parentLastName, contactInfo, relationship, studentID } = req.body;
        if (!email || !parentFirstName || !parentLastName || !contactInfo || !relationship)
          return res.status(400).json({ success: false, error: 'email, parentFirstName, parentLastName, contactInfo, and relationship are required' });
        const normalizedEmail = String(email).toLowerCase().trim();
        const passwordHash = await bcrypt.hash(String(password || '').trim() || 'ABClearning2026', 12);
        const { data, error } = await supabase.from('parent')
          .insert({
            email: normalizedEmail,
            password_hash: passwordHash,
            parentFirstName, parentMiddleName: parentMiddleName || '',
            parentLastName, contactInfo,
            relationshipStatus: relationship,
            studentID: studentID ? Number(studentID) : null,
            approved: 'approved',
          })
          .select('*').single();
        if (error) throw error;
        if (data && studentID) {
          await supabase.from('student').update({ parentID: Number((data as any).parentID) }).eq('studentID', Number(studentID));
        }
        return res.status(201).json({ success: true, data, message: 'Parent created' });
      }

      // Parents — PATCH /:id
      if (sub === 'parents' && id && !extra && req.method === 'PATCH') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { parentFirstName, parentMiddleName, parentLastName, contactInfo, relationship, studentIDs } = req.body;
        const updates: any = {};
        if (parentFirstName !== undefined) updates.parentFirstName = parentFirstName;
        if (parentMiddleName !== undefined) updates.parentMiddleName = parentMiddleName || '';
        if (parentLastName !== undefined) updates.parentLastName = parentLastName;
        if (contactInfo !== undefined) updates.contactInfo = contactInfo;
        if (relationship !== undefined) updates.relationshipStatus = relationship;
        const { data, error } = await supabase.from('parent').update(updates).eq('parentID', id).select('*').single();
        if (error) throw error;
        if (Array.isArray(studentIDs)) {
          try {
            const parentId = Number(id);
            const newIDs = studentIDs.map(Number).filter(Boolean);
            const { data: cur } = await supabase.from('student').select('studentID').eq('parentID', parentId);
            const curIDs = (cur || []).map((s: any) => s.studentID);
            const toUnlink = curIDs.filter((sid: number) => !newIDs.includes(sid));
            if (toUnlink.length > 0) await supabase.from('student').update({ parentID: null }).in('studentID', toUnlink);
            if (newIDs.length > 0) await supabase.from('student').update({ parentID: parentId }).in('studentID', newIDs);
          } catch (linkErr) { console.error('Parent student linking failed:', linkErr); }
        }
        return res.json({ success: true, data });
      }

      // Parents — DELETE /:id
      if (sub === 'parents' && id && req.method === 'DELETE') {
        if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
        const { error } = await supabase.from('parent').delete().eq('parentID', id);
        if (error) throw error;
        return res.json({ success: true, message: 'Parent deleted' });
      }
    }

    return res.status(404).json({ success: false, error: 'Route not found' });

  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
}