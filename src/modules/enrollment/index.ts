import { Router, Response } from 'express';
import { supabase } from '../../lib/supabase.js';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.js';

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
      const { data: students } = await supabase
        .from('student')
        .select('studentID')
        .eq('parentID', profileId);
      const ids = (students || []).map((s: { studentID: number }) => s.studentID);
      query = query.in('studentID', ids.length > 0 ? ids : [0]);
      // parents only see approved enrollments
      query = query.eq('status', 'approved');
    }

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

// POST /api/enrollment - admin creates enrollment
router.post('/', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { studentID, subjectID, subjectIDs } = req.body;
    const requestedSubjectIDs = Array.isArray(subjectIDs)
      ? subjectIDs.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
      : subjectID
        ? [Number(subjectID)]
        : [];

    if (!studentID || requestedSubjectIDs.length === 0) {
      return res.status(400).json({ success: false, error: 'studentID and at least one subject are required' });
    }

    const uniqueSubjectIDs = Array.from(new Set(requestedSubjectIDs));

    const { data: existing, error: existingError } = await supabase
      .from('enrollment')
      .select('subjectID, status')
      .eq('studentID', studentID)
      .in('subjectID', uniqueSubjectIDs);

    if (existingError) throw existingError;

    const existingSubjectIDs = new Set((existing || []).map((row: { subjectID: number }) => Number(row.subjectID)));
    const inserts = uniqueSubjectIDs
      .filter((subjectIDValue) => !existingSubjectIDs.has(subjectIDValue))
      .map((subjectIDValue) => ({
        studentID,
        subjectID: subjectIDValue,
        enrollmentDate: new Date().toISOString(),
        status: 'pending',
      }));

    if (inserts.length === 0) {
      return res.status(409).json({ success: false, error: 'Student is already enrolled in all selected subjects' });
    }

    const { data, error } = await supabase
      .from('enrollment')
      .insert(inserts)
      .select(`*, student(*), subject(*, tutor(*))`)
      ;

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data,
      message: `Enrollment created for ${data?.length || 0} subject${(data?.length || 0) === 1 ? '' : 's'}`,
    });
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
