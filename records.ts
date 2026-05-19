import { Router, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ─── STUDENTS ───────────────────────────────────────────
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
    const { stuFirstName, stuMiddleName, stuLastName, stuContactInfo, address, parentID } = req.body;
    const { data, error } = await supabase
      .from('student')
      .insert({ stuFirstName, stuMiddleName, stuLastName, stuContactInfo, address, status: 'active', parentID })
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
    const { data, error } = await supabase
      .from('student')
      .update(req.body)
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

// ─── SUBJECTS ───────────────────────────────────────────
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

router.post('/subjects', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { subjectName, units, description, tutorID } = req.body;
    const { data, error } = await supabase
      .from('subject')
      .insert({ subjectName, units, description, tutorID })
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
    const { data, error } = await supabase
      .from('subject')
      .update(req.body)
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

// ─── GRADES ───────────────────────────────────────────
router.get('/grades', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('grade')
      .select(`*, student(stuFirstName, stuLastName), subject(subjectName, units), tutor(tutorFirstName, tutorLastName)`)
      .order('gradeID', { ascending: false });

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

router.post('/grades', authorize('admin', 'tutor'), async (req: AuthRequest, res: Response) => {
  try {
    const { studentID, subjectID, gradeValue } = req.body;
    const tutorID = req.user!.role === 'tutor' ? req.user!.profileId : req.body.tutorID;

    const standing = gradeValue >= 75 ? 'Passed' : 'Failed';

    const { data, error } = await supabase
      .from('grade')
      .insert({ studentID, subjectID, tutorID, gradeValue: Number(gradeValue), academicStanding: standing })
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

router.delete('/grades/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('grade').delete().eq('gradeID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Grade deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── ATTENDANCE ───────────────────────────────────────────
router.get('/attendance', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('attendance')
      .select(`*, student(stuFirstName, stuLastName), tutor(tutorFirstName, tutorLastName)`)
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

router.delete('/attendance/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('attendance').delete().eq('attendanceID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Attendance record deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── TUTORS ───────────────────────────────────────────
router.get('/tutors', async (_req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase.from('tutor').select('*').order('tutorLastName');
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── PARENTS ───────────────────────────────────────────
router.get('/parents', authorize('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase.from('parent').select('*').order('parentLastName');
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
