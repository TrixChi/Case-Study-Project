import bcrypt from 'bcryptjs';
import { Router, Response } from 'express';
import { supabase } from '../../lib/supabase.js';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate);

const STUDENT_STATUSES = ['enrolled', 'graduate', 'unpaid', 'missing fees'] as const;
const RELATIONSHIP_STATUSES = ['pending', 'approved', 'rejected'] as const;
const PARENT_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;

function isValidStudentStatus(status: unknown): status is (typeof STUDENT_STATUSES)[number] {
  return typeof status === 'string' && STUDENT_STATUSES.includes(status as (typeof STUDENT_STATUSES)[number]);
}

// --- STUDENTS ---
router.get('/students', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;

    if (role === 'student') {
      const { data, error } = await supabase
        .from('student')
        .select('*, parent(parentID, parentFirstName, parentLastName, relationship)')
        .eq('studentID', profileId)
        .single();
      if (error) throw error;
      return res.json({ success: true, data: [data] });
    }

    if (role === 'parent') {
      const { data, error } = await supabase
        .from('student')
        .select('*, parent(parentID, parentFirstName, parentLastName, relationship)')
        .eq('parentID', profileId);
      if (error) throw error;
      return res.json({ success: true, data });
    }

    if (role === 'tutor') {
      const { data: tutorSubjects } = await supabase
        .from('subject')
        .select('subjectID')
        .eq('tutorID', profileId);
      const subjectIds = (tutorSubjects || []).map((s: { subjectID: number }) => s.subjectID);
      const { data: enrollments } = await supabase
        .from('enrollment')
        .select('studentID')
        .eq('status', 'approved')
        .in('subjectID', subjectIds.length > 0 ? subjectIds : [0]);
      const studentIds = [...new Set((enrollments || []).map((e: { studentID: number }) => e.studentID))];
      const { data, error } = await supabase
        .from('student')
        .select('*, parent(parentID, parentFirstName, parentLastName, relationship)')
        .in('studentID', studentIds.length > 0 ? studentIds : [0])
        .order('stuLastName');
      if (error) throw error;
      return res.json({ success: true, data });
    }

    const { data, error } = await supabase
      .from('student')
      .select('*, parent(parentID, parentFirstName, parentLastName, relationship)')
      .order('stuLastName');
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    console.error('GET /records/students failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/students', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      email,
      password,
      stuFirstName,
      stuMiddleName,
      stuLastName,
      stuContactInfo,
      address,
      status,
      parentID,
    } = req.body;

    if (!email || !stuFirstName || !stuLastName) {
      return res.status(400).json({ success: false, error: 'email, stuFirstName, and stuLastName are required' });
    }

    if (status && !isValidStudentStatus(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const { data: existingStudent } = await supabase
      .from('student')
      .select('studentID')
      .ilike('email', email.toLowerCase())
      .maybeSingle();
    if (existingStudent) {
      return res.status(409).json({ success: false, error: 'A student account with this email already exists' });
    }

    const normalizedEmail = email.toLowerCase();
    const passwordHash = await bcrypt.hash(String(password || '').trim() || 'ABClearning2026', 12);

    const insertPayload: Record<string, unknown> = {
      email: normalizedEmail,
      encrypted_password: passwordHash,
      stuFirstName,
      stuMiddleName: stuMiddleName || '',
      stuLastName,
      stuContactInfo: stuContactInfo || '',
      address: address || '',
      status: status || 'enrolled',
    };
    if (parentID) insertPayload.parentID = Number(parentID);

    const { data, error } = await supabase
      .from('student')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;

    supabase.from('app_users').insert({
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'student',
      first_name: stuFirstName,
      last_name: stuLastName,
      profile_id: data.studentID,
    }).then(() => {});

    return res.status(201).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/students/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (req.body.status && !isValidStudentStatus(req.body.status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const updates: Record<string, unknown> = {};
    if (req.body.email) updates.email = String(req.body.email).toLowerCase();
    if (req.body.stuFirstName !== undefined) updates.stuFirstName = req.body.stuFirstName;
    if (req.body.stuMiddleName !== undefined) updates.stuMiddleName = req.body.stuMiddleName || null;
    if (req.body.stuLastName !== undefined) updates.stuLastName = req.body.stuLastName;
    if (req.body.stuContactInfo !== undefined) updates.stuContactInfo = req.body.stuContactInfo;
    if (req.body.address !== undefined) updates.address = req.body.address;
    if (req.body.status !== undefined) updates.status = req.body.status;
    if ('parentID' in req.body) updates.parentID = req.body.parentID ?? null;
    if (req.body.password) {
      updates.encrypted_password = await bcrypt.hash(req.body.password, 12);
    }
    if (req.body.overdueFees !== undefined && req.body.overdueFees !== '') {
      updates.overdueFees = Number(req.body.overdueFees);
    } else if (req.body.overdueFees === null) {
      updates.overdueFees = null;
    }

    const { data, error } = await supabase
      .from('student')
      .update(updates)
      .eq('studentID', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    console.error('PATCH /records/students/:id failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/students/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('student').delete().eq('studentID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Student deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- SUBJECTS ---
router.get('/subjects', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('subject')
      .select('*, tutor(tutorFirstName, tutorLastName, specialization)')
      .order('subjectName');

    if (role === 'tutor') {
      query = query.eq('tutorID', profileId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});


function isValidRelationshipStatus(value: unknown): value is (typeof RELATIONSHIP_STATUSES)[number] {
  return typeof value === 'string' && RELATIONSHIP_STATUSES.includes(value as (typeof RELATIONSHIP_STATUSES)[number]);
}

function isValidParentApprovalStatus(value: unknown): value is (typeof PARENT_APPROVAL_STATUSES)[number] {
  return typeof value === 'string' && PARENT_APPROVAL_STATUSES.includes(value as (typeof PARENT_APPROVAL_STATUSES)[number]);
}

function sortParentsByApproval<T extends { approved?: string | null; parentLastName?: string | null }>(parents: T[]) {
  const priority: Record<string, number> = {
    pending: 0,
    approved: 1,
    rejected: 2,
  };

  return [...parents].sort((left, right) => {
    const leftPriority = priority[left.approved || 'pending'] ?? 99;
    const rightPriority = priority[right.approved || 'pending'] ?? 99;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return String(left.parentLastName || '').localeCompare(String(right.parentLastName || ''));
  });
}

router.post('/subjects', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { subjectName, units, description, tutorID, fee } = req.body;

    if (!subjectName || units === undefined || fee === undefined || fee === '') {
      return res.status(400).json({ success: false, error: 'subjectName, units, and fee are required' });
    }

    const parsedFee = parseFloat(String(fee));
    if (isNaN(parsedFee) || parsedFee < 0) {
      return res.status(400).json({ success: false, error: 'fee must be a valid positive number' });
    }

    const { data, error } = await supabase
      .from('subject')
      .insert({
        subjectName,
        units: Number(units),
        description: description || null,
        tutorID: tutorID ? Number(tutorID) : null,
        fee: parseFloat(parsedFee.toFixed(2)),
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/subjects/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const updates: Record<string, unknown> = { ...req.body };
    if (updates.units !== undefined) updates.units = Number(updates.units);
    if (updates.tutorID !== undefined) updates.tutorID = updates.tutorID ? Number(updates.tutorID) : null;
    if (updates.fee !== undefined) {
      const parsedFee = parseFloat(String(updates.fee));
      if (isNaN(parsedFee) || parsedFee < 0) {
        return res.status(400).json({ success: false, error: 'fee must be a valid positive number' });
      }
      updates.fee = parseFloat(parsedFee.toFixed(2));
    }

    const { data, error } = await supabase
      .from('subject')
      .update(updates)
      .eq('subjectID', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/subjects/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('subject').delete().eq('subjectID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Subject deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- GRADES ---
router.get('/grades', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('grade')
      .select(`*, student(stuFirstName, stuLastName), subject(subjectName, units), tutor(tutorFirstName, tutorLastName)`)
      .order('gradeID', { ascending: false });

    if (role === 'student') {
      query = query.eq('studentID', profileId).eq('released', true);
    } else if (role === 'parent') {
      const { data: students } = await supabase
        .from('student').select('studentID').eq('parentID', profileId);
      const ids = (students || []).map((s: { studentID: number }) => s.studentID);
      query = query.in('studentID', ids.length > 0 ? ids : [0]).eq('released', true);
    } else if (role === 'tutor') {
      query = query.eq('tutorID', profileId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/grades', authorize('admin', 'tutor'), async (req: AuthRequest, res: Response) => {
  try {
    const { studentID, subjectID, gradeValue } = req.body;
    const tutorID = req.user!.role === 'tutor' ? req.user!.profileId : req.body.tutorID;

    const standing = gradeValue >= 75 ? 'Passed' : 'Failed';

    const { data, error } = await supabase
      .from('grade')
      .insert({ studentID, subjectID, tutorID, gradeValue: Number(gradeValue), academicStanding: standing, released: req.user!.role !== 'tutor' })
      .select(`*, student(stuFirstName, stuLastName), subject(subjectName), tutor(tutorFirstName, tutorLastName)`) 
      .single();
    if (error) throw error;
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/grades/:id', authorize('admin', 'tutor'), async (req: AuthRequest, res: Response) => {
  try {
    const updates: Record<string, unknown> = { ...req.body };
    if (updates.gradeValue) {
      updates.academicStanding = Number(updates.gradeValue) >= 75 ? 'Passed' : 'Failed';
    }
    const { data, error } = await supabase
      .from('grade')
      .update(updates)
      .eq('gradeID', req.params.id)
      .select(`*, student(stuFirstName, stuLastName), subject(subjectName)`) 
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin can mark grade as released for viewing by parents/students
router.patch('/grades/:id/release', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { released } = req.body;
    const { data, error } = await supabase
      .from('grade')
      .update({ released: !!released })
      .eq('gradeID', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data, message: `Grade ${released ? 'released' : 'unreleased'}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/grades/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('grade').delete().eq('gradeID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Grade deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- ATTENDANCE ---
router.get('/attendance', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('attendance')
      .select(`*, student(stuFirstName, stuLastName), tutor(tutorFirstName, tutorLastName), subject(subjectName)`)
      .order('attendanceDate', { ascending: false });

    if (role === 'student') {
      query = query.eq('studentID', profileId);
    } else if (role === 'parent') {
      const { data: students } = await supabase
        .from('student').select('studentID').eq('parentID', profileId);
      const ids = (students || []).map((s: { studentID: number }) => s.studentID);
      query = query.in('studentID', ids.length > 0 ? ids : [0]);
    } else if (role === 'tutor') {
      query = query.eq('tutorID', profileId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/attendance', authorize('admin', 'tutor'), async (req: AuthRequest, res: Response) => {
  try {
    const { studentID, subjectID, status, attendanceDate } = req.body;
    const tutorID = req.user!.role === 'tutor' ? req.user!.profileId : req.body.tutorID;

    const { data, error } = await supabase
      .from('attendance')
      .insert({
        studentID,
        subjectID,
        tutorID,
        status: status || 'present',
        attendanceDate: attendanceDate || new Date().toISOString(),
        released: true,
      })
      .select(`*, student(stuFirstName, stuLastName)`) 
      .single();
    if (error) throw error;
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/attendance/:id', authorize('admin', 'tutor'), async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .update(req.body)
      .eq('attendanceID', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin can release attendance for viewing
router.patch('/attendance/:id/release', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { released } = req.body;
    const { data, error } = await supabase
      .from('attendance')
      .update({ released: !!released })
      .eq('attendanceID', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data, message: `Attendance ${released ? 'released' : 'unreleased'}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/attendance/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('attendance').delete().eq('attendanceID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Attendance record deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- TUTORS ---
router.get('/tutors', async (_req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase.from('tutor').select('*').order('tutorLastName');
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/tutors', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, tutorFirstName, tutorLastName, specialization, status } = req.body;

    if (!email || !tutorFirstName || !tutorLastName || !specialization) {
      return res.status(400).json({ success: false, error: 'email, tutorFirstName, tutorLastName, and specialization are required' });
    }

    if (status && !['active', 'on leave', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid tutor status' });
    }

    const { data: existingTutor } = await supabase
      .from('tutor')
      .select('tutorID')
      .ilike('email', email.toLowerCase())
      .maybeSingle();
    if (existingTutor) {
      return res.status(409).json({ success: false, error: 'A tutor account with this email already exists' });
    }

    const normalizedEmail = email.toLowerCase();
    const passwordHash = await bcrypt.hash(String(password || '').trim() || 'ABClearning2026', 12);

    const { data, error } = await supabase
      .from('tutor')
      .insert({
        email: normalizedEmail,
        encrypted_password: passwordHash,
        tutorFirstName,
        tutorLastName,
        specialization,
        status: status || 'active',
      })
      .select()
      .single();

    if (error) throw error;

    supabase.from('app_users').insert({
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'tutor',
      first_name: tutorFirstName,
      last_name: tutorLastName,
      profile_id: data.tutorID,
    }).then(() => {});

    return res.status(201).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/tutors/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, tutorFirstName, tutorLastName, specialization, email } = req.body;

    if (status && !['active', 'on leave', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid tutor status' });
    }

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (tutorFirstName !== undefined) updates.tutorFirstName = tutorFirstName;
    if (tutorLastName !== undefined) updates.tutorLastName = tutorLastName;
    if (specialization !== undefined) updates.specialization = specialization;
    if (email) updates.email = String(email).toLowerCase();

    const { data, error } = await supabase
      .from('tutor')
      .update(updates)
      .eq('tutorID', req.params.id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    console.error('PATCH /records/tutors/:id failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/tutors/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { data: tutor, error: fetchError } = await supabase
      .from('tutor')
      .select('status')
      .eq('tutorID', req.params.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!tutor) {
      return res.status(404).json({ success: false, error: 'Tutor not found' });
    }

    if (tutor.status !== 'dismissed') {
      return res.status(400).json({ success: false, error: 'Only dismissed tutors can be deleted' });
    }

    const { error } = await supabase.from('tutor').delete().eq('tutorID', req.params.id);
    if (error) throw error;

    return res.json({ success: true, message: 'Tutor deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- PARENTS ---
router.get('/parents', authorize('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('parent')
      .select('*')
      .order('parentLastName');
    if (error) throw error;
    return res.json({ success: true, data: sortParentsByApproval(data || []) });
  } catch (err) {
    console.error('GET /records/parents failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/parents/me', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;

    if (role !== 'student' && role !== 'parent' && role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not allowed' });
    }

    if (role === 'student') {
      if (!profileId) return res.json({ success: true, data: null });

      // Resolve parent via the student's parentID (set by admin)
      const { data: studentRow } = await supabase
        .from('student')
        .select('parentID')
        .eq('studentID', profileId)
        .single();

      if (studentRow?.parentID) {
        const { data: parentByStudentParentID, error: pErr } = await supabase
          .from('parent')
          .select('*')
          .eq('parentID', studentRow.parentID)
          .single();
        if (pErr && pErr.code !== 'PGRST116') throw pErr;
        if (parentByStudentParentID) return res.json({ success: true, data: parentByStudentParentID });
      }

      // Fallback: parent record that has studentID pointing to this student
      const { data, error } = await supabase
        .from('parent')
        .select('*')
        .eq('studentID', profileId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return res.json({ success: true, data: data || null });
    }

    if (role === 'parent') {
      const { data, error } = await supabase
        .from('parent')
        .select('*')
        .eq('parentID', profileId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return res.json({ success: true, data: data || null });
    }

    const { data, error } = await supabase
      .from('parent')
      .select('*')
      .order('parentLastName');

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    console.error('GET /records/parents/me failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/parents/lookup', async (req: AuthRequest, res: Response) => {
  try {
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const { data, error } = await supabase
      .from('parent')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return res.json({ success: true, data: data || null });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /records/parents/:id/students - admin can view students linked to a parent
router.get('/parents/:id/students', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parentId = Number(req.params.id);

    const [{ data: byParentID, error }, { data: parentRecord }] = await Promise.all([
      supabase
        .from('student')
        .select('studentID, stuFirstName, stuLastName, status')
        .eq('parentID', parentId)
        .order('stuLastName'),
      supabase.from('parent').select('studentID').eq('parentID', parentId).single(),
    ]);

    if (error) throw error;

    const students = [...(byParentID || [])];

    if (parentRecord?.studentID) {
      const alreadyIncluded = students.some((s) => s.studentID === parentRecord.studentID);
      if (!alreadyIncluded) {
        const { data: extraStudent } = await supabase
          .from('student')
          .select('studentID, stuFirstName, stuLastName, status')
          .eq('studentID', parentRecord.studentID)
          .single();
        if (extraStudent) students.push(extraStudent);
      }
    }

    return res.json({ success: true, data: students });
  } catch (err) {
    console.error('GET /records/parents/:id/students failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /records/parents/me/dashboard - parent dashboard aggregates
router.get('/parents/me/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    if (role !== 'parent') return res.status(403).json({ success: false, error: 'Not allowed' });

    // fetch students linked to this parent
    const { data: students = [], error: studentsError } = await supabase
      .from('student')
      .select('studentID, stuFirstName, stuLastName')
      .eq('parentID', profileId);
    if (studentsError) throw studentsError;

    // for each student compute avg grade, attendance rate, latest balance, enrollment count
    const perStudent = await Promise.all((students || []).map(async (s: any) => {
      const studentID = s.studentID;

      // grades
      const { data: grades = [], error: gradesError } = await supabase
        .from('grade')
        .select('gradeValue')
        .eq('studentID', studentID);
      if (gradesError) throw gradesError;
      const gradeList = grades || [];
      const avgGrade = gradeList.length ? gradeList.reduce((a: number, g: any) => a + Number(g.gradeValue), 0) / gradeList.length : null;

      // attendance
      const { data: attendance = [], error: attendanceError } = await supabase
        .from('attendance')
        .select('status')
        .eq('studentID', studentID);
      if (attendanceError) throw attendanceError;
      const attendanceList = attendance || [];
      const totalAttend = attendanceList.length;
      const presentCount = attendanceList.filter((a: any) => String(a.status).toLowerCase() === 'present').length;
      const attendanceRate = totalAttend ? (presentCount / totalAttend) * 100 : null;

      // latest payment balance
      const { data: lastPayment } = await supabase
        .from('payment')
        .select('balance')
        .eq('studentID', studentID)
        .order('paymentDate', { ascending: false })
        .limit(1)
        .single();
      const balance = lastPayment ? Number(lastPayment.balance) : 0;

      // enrollments count (approved)
      const { data: enrollments = [], error: enrollError } = await supabase
        .from('enrollment')
        .select('enrollmentID')
        .eq('studentID', studentID)
        .eq('status', 'approved');
      if (enrollError) throw enrollError;
      const enrollmentCount = (enrollments || []).length || 0;

      return {
        studentID,
        stuFirstName: s.stuFirstName,
        stuLastName: s.stuLastName,
        avgGrade: avgGrade === null ? null : Number(avgGrade.toFixed(2)),
        attendanceRate: attendanceRate === null ? null : Number(attendanceRate.toFixed(2)),
        balance,
        enrollmentCount,
      };
    }));

    const totalPendingBalance = perStudent.reduce((sum: number, p: any) => sum + Number(p.balance || 0), 0);
    const totalEnrollments = perStudent.reduce((sum: number, p: any) => sum + Number(p.enrollmentCount || 0), 0);

    return res.json({ success: true, data: { students: perStudent, totals: { totalPendingBalance, totalEnrollments } } });
  } catch (err) {
    console.error('GET /records/parents/me/dashboard failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/parents', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, parentFirstName, parentMiddleName, parentLastName, contactInfo, relationship, studentID } = req.body;

    if (!email || !parentFirstName || !parentLastName || !contactInfo || !relationship) {
      return res.status(400).json({ success: false, error: 'email, parentFirstName, parentLastName, contactInfo, and relationship are required' });
    }

    if (studentID) {
      const { data: student, error: studentError } = await supabase
        .from('student')
        .select('studentID, parentID')
        .eq('studentID', Number(studentID))
        .single();

      if (studentError) throw studentError;
      if (student?.parentID) {
        return res.status(409).json({ success: false, error: 'This student already has a parent linked' });
      }
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const passwordHash = await bcrypt.hash(String(password || '').trim() || 'ABClearning2026', 12);

    const { data, error } = await supabase
      .from('parent')
      .insert({
        email: normalizedEmail,
        encrypted_password: passwordHash,
        parentFirstName,
        parentMiddleName: parentMiddleName || '',
        parentLastName,
        contactInfo,
        relationshipStatus: relationship,
        studentID: studentID ? Number(studentID) : null,
        approved: 'approved',
      })
      .select('*')
      .single();

    if (error) throw error;
    // If this parent is linked to a student, update that student's parentID
    if (data && studentID) {
      const { error: studentUpdateError } = await supabase
        .from('student')
        .update({ parentID: Number(data.parentID) })
        .eq('studentID', Number(studentID));
      if (studentUpdateError) throw studentUpdateError;
    }

    supabase.from('app_users').insert({
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'parent',
      first_name: parentFirstName,
      last_name: parentLastName,
      profile_id: data.parentID,
    }).then(() => {});

    return res.status(201).json({ success: true, data, message: 'Parent request submitted' });
  } catch (err) {
    console.error('POST /records/parents failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/parents/me', authorize('student'), async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, parentFirstName, parentMiddleName, parentLastName, contactInfo, relationship } = req.body;
    const studentID = req.user!.profileId;

    const { data: student, error: studentError } = await supabase
      .from('student')
      .select('studentID, parentID')
      .eq('studentID', studentID)
      .single();

    if (studentError) throw studentError;
    if (student?.parentID) {
      return res.status(409).json({ success: false, error: 'This student already has a parent linked' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const { data: existingParent, error: parentLookupError } = await supabase
      .from('parent')
      .select('parentID, studentID')
      .eq('email', normalizedEmail)
      .single();

    if (parentLookupError && parentLookupError.code !== 'PGRST116') throw parentLookupError;
    if (existingParent?.studentID && existingParent.studentID !== studentID) {
      return res.status(409).json({ success: false, error: 'That parent account is already linked to another student' });
    }

    if (!existingParent && (!email || !parentFirstName || !parentLastName || !contactInfo || !relationship)) {
      return res.status(400).json({ success: false, error: 'email, parentFirstName, parentLastName, contactInfo, and relationship are required when creating a new account' });
    }

    const resolvedPassword = String(password || '').trim() || 'ABClearning2026';

    const payload: Record<string, unknown> = {
      email: normalizedEmail,
      relationshipStatus: relationship,
      studentID,
      approved: 'approved',
    };

    if (parentFirstName) payload.parentFirstName = parentFirstName;
    if (parentMiddleName !== undefined) payload.parentMiddleName = parentMiddleName || null;
    if (parentLastName) payload.parentLastName = parentLastName;
    if (contactInfo) payload.contactInfo = contactInfo;

    if (!existingParent) {
      payload.encrypted_password = await bcrypt.hash(resolvedPassword, 12);
    }

    const { data, error } = existingParent
      ? await supabase
        .from('parent')
        .update(payload)
        .eq('parentID', existingParent.parentID)
        .select('*')
        .single()
      : await supabase
        .from('parent')
        .insert({
          ...payload,
          encrypted_password: payload.encrypted_password,
        })
        .select('*')
        .single();

    if (error) throw error;
    // Ensure the student's parentID is set when a parent is created/updated
    if (data && data.parentID && studentID) {
      const { error: studentUpdateError } = await supabase
        .from('student')
        .update({ parentID: Number(data.parentID) })
        .eq('studentID', Number(studentID));
      if (studentUpdateError) throw studentUpdateError;
    }
    return res.status(existingParent ? 200 : 201).json({ success: true, data, message: 'Parent request submitted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/parents/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { parentFirstName, parentMiddleName, parentLastName, contactInfo, relationship, studentIDs } = req.body;
    const parentId = Number(req.params.id);

    const updates: Record<string, unknown> = {};
    if (parentFirstName !== undefined) updates.parentFirstName = parentFirstName;
    if (parentMiddleName !== undefined) updates.parentMiddleName = parentMiddleName || '';
    if (parentLastName !== undefined) updates.parentLastName = parentLastName;
    if (contactInfo !== undefined) updates.contactInfo = contactInfo;
    if (relationship !== undefined) updates.relationshipStatus = relationship;

    const { data, error } = await supabase
      .from('parent')
      .update(updates)
      .eq('parentID', parentId)
      .select('*')
      .single();

    if (error) throw error;

    if (Array.isArray(studentIDs)) {
      const newIDs = studentIDs.map(Number).filter(Boolean);

      const { data: currentStudents } = await supabase
        .from('student').select('studentID').eq('parentID', parentId);
      const currentIDs = (currentStudents || []).map((s: { studentID: number }) => s.studentID);

      const toUnlink = currentIDs.filter((id) => !newIDs.includes(id));
      if (toUnlink.length > 0) {
        await supabase.from('student').update({ parentID: null }).in('studentID', toUnlink);
      }
      if (newIDs.length > 0) {
        await supabase.from('student').update({ parentID: parentId }).in('studentID', newIDs);
      }
      const primaryStudentID = newIDs[0] ?? null;
      await supabase.from('parent').update({ studentID: primaryStudentID }).eq('parentID', parentId);
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('PATCH /records/parents/:id failed', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/parents/:id/validate', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!isValidParentApprovalStatus(status) || status === 'pending') {
      return res.status(400).json({ success: false, error: 'Invalid validation status' });
    }

    const { data: parent, error: parentError } = await supabase
      .from('parent')
      .select('parentID, studentID')
      .eq('parentID', req.params.id)
      .single();

    if (parentError) throw parentError;

    const { error: updateError } = await supabase
      .from('parent')
      .update({
        approved: status,
      })
      .eq('parentID', req.params.id);

    if (updateError) throw updateError;

    if (status === 'approved' && parent?.studentID) {
      const { error: studentError } = await supabase
        .from('student')
        .update({ parentID: Number(parent.parentID) })
        .eq('studentID', Number(parent.studentID));

      if (studentError) throw studentError;
    }

    if (status === 'rejected' && parent?.studentID) {
      const { error: studentError } = await supabase
        .from('student')
        .update({ parentID: null })
        .eq('studentID', Number(parent.studentID));

      if (studentError) throw studentError;
    }

    return res.json({ success: true, message: `Relationship ${status}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
