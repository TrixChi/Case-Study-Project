import { Router, Response } from 'express';
import { supabase } from './src/lib/supabase.js';
import { authenticate, authorize, AuthRequest } from './src/middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/enrollment - list enrollments based on role
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('enrollment')
      .select(`
        *,
        student(studentID, stuFirstName, stuLastName, stuContactInfo, status),
        subject(subjectID, subjectName, units, description, tutorID,
          tutor(tutorFirstName, tutorLastName))
      `)
      .order('enrollmentDate', { ascending: false });

    if (role === 'student') {
      query = query.eq('studentID', profileId);
    } else if (role === 'parent') {
      // Get linked student IDs (both directions: student.parentID and parent.studentID)
      const [{ data: byParentID }, { data: parentRecord }] = await Promise.all([
        supabase.from('student').select('studentID').eq('parentID', profileId),
        supabase.from('parent').select('studentID').eq('parentID', profileId).single(),
      ]);
      const idSet = new Set((byParentID || []).map((s: { studentID: number }) => s.studentID));
      if (parentRecord?.studentID) idSet.add(parentRecord.studentID);
      const ids = [...idSet];
      query = query.in('studentID', ids.length > 0 ? ids : [0]);
    }
    // admins and tutors see all

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/enrollment/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('enrollment')
      .select(`*, student(*), subject(*, tutor(*))`)
      .eq('enrollmentID', req.params.id)
      .single();
    if (error) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/enrollment - admin or student creates enrollment
router.post('/', authorize('admin', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    const studentID = role === 'student' ? profileId : Number(req.body.studentID);
    const { subjectIDs, subjectID } = req.body;
    const ids: number[] = subjectIDs?.length > 0
      ? subjectIDs.map(Number)
      : subjectID ? [Number(subjectID)] : [];

    if (!studentID || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'studentID and at least one subjectID required' });
    }

    const enrollmentDate = new Date().toISOString();
    const created = [];
    const skipped = [];

    for (const sid of ids) {
      const { data: existing } = await supabase
        .from('enrollment')
        .select('enrollmentID')
        .eq('studentID', studentID)
        .eq('subjectID', sid)
        .in('status', ['approved', 'pending'])
        .single();

      if (existing) {
        skipped.push(sid);
        continue;
      }

      const { data, error } = await supabase
        .from('enrollment')
        .insert({ studentID, subjectID: sid, enrollmentDate, status: 'pending' })
        .select(`*, student(*), subject(*, tutor(*))`)
        .single();

      if (error) throw error;
      created.push(data);
    }

    if (created.length === 0) {
      return res.status(409).json({ success: false, error: 'Student is already enrolled in all selected subjects' });
    }

    return res.status(201).json({ success: true, data: created, message: `${created.length} enrollment(s) created` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/enrollment/:id/status - admin approves/rejects
router.patch('/:id/status', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const { data, error } = await supabase
      .from('enrollment')
      .update({
        status,
        validatedBy: req.user!.profileId,
      })
      .eq('enrollmentID', req.params.id)
      .select(`*, student(*), subject(*)`)
      .single();

    if (error) throw error;
    return res.json({ success: true, data, message: `Enrollment ${status}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/enrollment/:id - admin only
router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase
      .from('enrollment')
      .delete()
      .eq('enrollmentID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Enrollment deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
