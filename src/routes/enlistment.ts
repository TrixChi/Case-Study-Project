import { Router, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/enlistment
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('enlistment')
      .select(`
        *,
        student(studentID, stuFirstName, stuLastName),
        subject(subjectID, subjectName, units, fee, tutor(tutorFirstName, tutorLastName))
      `)
      .order('enlistmentDate', { ascending: false });

    if (role === 'student') {
      query = query.eq('studentID', profileId);
    }
    // admin sees all

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/enlistment - student submits multiple subjects
router.post('/', authorize('student'), async (req: AuthRequest, res: Response) => {
  try {
    const { profileId } = req.user!;
    const { subjectIDs } = req.body;

    if (!Array.isArray(subjectIDs) || subjectIDs.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one subjectID is required' });
    }

    const enlistmentDate = new Date().toISOString();
    const created = [];
    const skipped = [];

    for (const sid of subjectIDs.map(Number)) {
      const { data: existing } = await supabase
        .from('enlistment')
        .select('enlistmentID')
        .eq('studentID', profileId)
        .eq('subjectID', sid)
        .in('status', ['pending', 'approved'])
        .single();

      if (existing) { skipped.push(sid); continue; }

      const { data: passingGrade } = await supabase
        .from('grade')
        .select('gradeID')
        .eq('studentID', profileId)
        .eq('subjectID', sid)
        .eq('academicStanding', 'Passed')
        .single();

      if (passingGrade) { skipped.push(sid); continue; }

      const { data, error } = await supabase
        .from('enlistment')
        .insert({ studentID: profileId, subjectID: sid, enlistmentDate, status: 'pending' })
        .select('*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName)')
        .single();

      if (error) throw error;
      created.push(data);
    }

    if (created.length === 0) {
      return res.status(409).json({ success: false, error: 'Already enlisted in all selected subjects' });
    }

    return res.status(201).json({
      success: true,
      data: created,
      message: `${created.length} enlistment(s) submitted${skipped.length > 0 ? `, ${skipped.length} already enlisted` : ''}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/enlistment/:id/status - admin approves or rejects
router.patch('/:id/status', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const { data, error } = await supabase
      .from('enlistment')
      .update({ status, validatedBy: req.user!.profileId, validatedAt: new Date().toISOString() })
      .eq('enlistmentID', req.params.id)
      .select('*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName)')
      .single();

    if (error) throw error;

    // Auto-create enrollment when approved
    if (status === 'approved' && data) {
      const { data: existing } = await supabase
        .from('enrollment')
        .select('enrollmentID')
        .eq('studentID', data.studentID)
        .eq('subjectID', data.subjectID)
        .single();

      if (!existing) {
        await supabase.from('enrollment').insert({
          studentID: data.studentID,
          subjectID: data.subjectID,
          enrollmentDate: new Date().toISOString(),
          status: 'approved',
        });
      }
    }

    return res.json({ success: true, data, message: `Enlistment ${status}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/enlistment/:id - admin removes
router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('enlistment').delete().eq('enlistmentID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Enlistment deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
