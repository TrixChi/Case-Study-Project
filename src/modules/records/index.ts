import bcrypt from 'bcryptjs';
import { Router, Response } from 'express';
import { supabase } from '../../lib/supabase.js';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate);

const STUDENT_STATUSES = ['enrolled', 'graduate', 'unpaid', 'missing fees'] as const;
const RELATIONSHIP_STATUSES = ['pending', 'approved', 'rejected'] as const;

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
        .select('*, parent(*)')
        .eq('studentID', profileId)
        .single();
      if (error) throw error;
      return res.json({ success: true, data: [data] });
    }

    if (role === 'parent') {
      const { data, error } = await supabase
        .from('student')
        .select('*')
        .eq('parentID', profileId);
      if (error) throw error;
      return res.json({ success: true, data });
    }

    const { data, error } = await supabase
      .from('student')
      .select('*, parent(parentFirstName, parentLastName, contactInfo, relationship)')
      .order('stuLastName');
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
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

    if (!email || !password || !stuFirstName || !stuLastName || !stuContactInfo || !address) {
      return res.status(400).json({ success: false, error: 'email, password, stuFirstName, stuLastName, stuContactInfo, and address are required' });
    }

    if (status && !isValidStudentStatus(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from('student')
      .insert({
        email: email.toLowerCase(),
        encrypted_password: passwordHash,
        stuFirstName,
        stuMiddleName: stuMiddleName || null,
        stuLastName,
        stuContactInfo,
        address,
        status: status || 'enrolled',
        parentID: parentID || null,
      })
      .select()
      .single();
    if (error) throw error;
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

    const updates: Record<string, unknown> = {
      email: req.body.email?.toLowerCase(),
      stuFirstName: req.body.stuFirstName,
      stuMiddleName: req.body.stuMiddleName || null,
      stuLastName: req.body.stuLastName,
      stuContactInfo: req.body.stuContactInfo,
      address: req.body.address,
      status: req.body.status,
      parentID: req.body.parentID ?? null,
    };

    if (req.body.password) {
      updates.encrypted_password = await bcrypt.hash(req.body.password, 12);
    }

    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) {
        delete updates[key];
      }
    });

    const { data, error } = await supabase
      .from('student')
      .update(updates)
      .eq('studentID', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
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
router.get('/subjects', async (_req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('subject')
      .select('*, tutor(tutorFirstName, tutorLastName, specialization)')
      .order('subjectName');
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

function isTwoDecimalFee(value: unknown) {
  return typeof value === 'string' && /^\d+(?:\.\d{2})$/.test(value.trim());
}

function isValidRelationshipStatus(value: unknown): value is (typeof RELATIONSHIP_STATUSES)[number] {
  return typeof value === 'string' && RELATIONSHIP_STATUSES.includes(value as (typeof RELATIONSHIP_STATUSES)[number]);
}

router.post('/subjects', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { subjectName, units, description, tutorID, fee } = req.body;

    if (!subjectName || units === undefined || fee === undefined) {
      return res.status(400).json({ success: false, error: 'subjectName, units, and fee are required' });
    }

    if (!isTwoDecimalFee(String(fee))) {
      return res.status(400).json({ success: false, error: 'fee must have exactly 2 decimal places' });
    }

    const { data, error } = await supabase
      .from('subject')
      .insert({
        subjectName,
        units: Number(units),
        description: description || null,
        tutorID: tutorID ? Number(tutorID) : null,
        fee: Number(fee),
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
    if (req.body.fee !== undefined && !isTwoDecimalFee(String(req.body.fee))) {
      return res.status(400).json({ success: false, error: 'fee must have exactly 2 decimal places' });
    }

    const updates: Record<string, unknown> = { ...req.body };
    if (updates.units !== undefined) updates.units = Number(updates.units);
    if (updates.tutorID !== undefined) updates.tutorID = updates.tutorID ? Number(updates.tutorID) : null;
    if (updates.fee !== undefined) updates.fee = Number(updates.fee);

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
      .insert({ studentID, subjectID, tutorID, gradeValue: Number(gradeValue), academicStanding: standing, released: false })
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
      // when tutor/admin updates grade, mark released=false until admin re-verifies
      updates.released = false;
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
      .select(`*, student(stuFirstName, stuLastName), tutor(tutorFirstName, tutorLastName)`) 
      .order('attendanceDate', { ascending: false });

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
        released: false,
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

    if (!email || !password || !tutorFirstName || !tutorLastName || !specialization) {
      return res.status(400).json({ success: false, error: 'email, password, tutorFirstName, tutorLastName, and specialization are required' });
    }

    if (status && !['active', 'on leave', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid tutor status' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data, error } = await supabase
      .from('tutor')
      .insert({
        email: email.toLowerCase(),
        encrypted_password: passwordHash,
        tutorFirstName,
        tutorLastName,
        specialization,
        status: status || 'active',
      })
      .select()
      .single();

    if (error) throw error;
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
    if (email !== undefined) updates.email = String(email).toLowerCase();

    const { data, error } = await supabase
      .from('tutor')
      .update(updates)
      .eq('tutorID', req.params.id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
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
      .select('*, student(studentID, stuFirstName, stuLastName)')
      .order('relationshipStatus', { ascending: true })
      .order('parentLastName');
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
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

    if (!existingParent && (!email || !parentFirstName || !parentLastName || !contactInfo || !relationship || !password)) {
      return res.status(400).json({ success: false, error: 'email, password, parentFirstName, parentLastName, contactInfo, and relationship are required when creating a new account' });
    }

    const payload: Record<string, unknown> = {
      email: normalizedEmail,
      relationship,
      studentID,
      relationshipStatus: 'pending',
      validatedBy: null,
      validatedAt: null,
    };

    if (parentFirstName) payload.parentFirstName = parentFirstName;
    if (parentMiddleName !== undefined) payload.parentMiddleName = parentMiddleName || null;
    if (parentLastName) payload.parentLastName = parentLastName;
    if (contactInfo) payload.contactInfo = contactInfo;

    if (!existingParent) {
      payload.encrypted_password = await bcrypt.hash(String(password), 12);
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
    return res.status(existingParent ? 200 : 201).json({ success: true, data, message: 'Parent request submitted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/parents/:id/validate', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!isValidRelationshipStatus(status)) {
      return res.status(400).json({ success: false, error: 'Invalid relationship status' });
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
        relationshipStatus: status,
        validatedBy: req.user!.profileId,
        validatedAt: new Date().toISOString(),
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
