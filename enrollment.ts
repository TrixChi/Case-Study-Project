import { Router, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

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
      // Get linked student IDs
      const { data: students } = await supabase
        .from('student')
        .select('studentID')
        .eq('parentID', profileId);
      const ids = (students || []).map((s: { studentID: number }) => s.studentID);
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

// POST /api/enrollment - admin creates enrollment
router.post('/', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { studentID, subjectID } = req.body;
    if (!studentID || !subjectID) {
      return res.status(400).json({ success: false, error: 'studentID and subjectID required' });
    }

    // Check duplicate
    const { data: existing } = await supabase
      .from('enrollment')
      .select('enrollmentID')
      .eq('studentID', studentID)
      .eq('subjectID', subjectID)
      .eq('status', 'approved')
      .single();

    if (existing) {
      return res.status(409).json({ success: false, error: 'Student already enrolled in this subject' });
    }

    const { data, error } = await supabase
      .from('enrollment')
      .insert({
        studentID,
        subjectID,
        enrollmentDate: new Date().toISOString(),
        status: 'pending',
      })
      .select(`*, student(*), subject(*, tutor(*))`)
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, data, message: 'Enrollment created' });
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
