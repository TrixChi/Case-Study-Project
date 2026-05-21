import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Helper to parse numeric id
const toId = (v: any) => (typeof v === 'string' ? Number(v) : v);

// GET / - list enrollments with ownership filtering
router.get('/', authenticate, authorize('admin', 'tutor', 'student', 'parent'), async (req, res) => {
  try {
    const user = req.user!;

    // Admin: return everything
    if (user.role === 'admin') {
      const { data, error } = await supabase
        .from('enrollment')
        .select('*, student(*), subject(*)')
        .order('enrollmentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    // Student: only their enrollments
    if (user.role === 'student') {
      const { data, error } = await supabase
        .from('enrollment')
        .select('*, student(*), subject(*)')
        .eq('studentID', user.profileId)
        .order('enrollmentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    // Parent: enrollments for their children
    if (user.role === 'parent') {
      const { data: kids, error: kErr } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
      if (kErr) return res.status(500).json({ success: false, error: kErr.message });
      const ids = (kids || []).map((s: any) => s.studentID);
      if (ids.length === 0) return res.json({ success: true, data: [] });
      const { data, error } = await supabase
        .from('enrollment')
        .select('*, student(*), subject(*)')
        .in('studentID', ids)
        .order('enrollmentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    // Tutor: enrollments for subjects they teach
    if (user.role === 'tutor') {
      const { data: subjects, error: sErr } = await supabase.from('subject').select('subjectID').eq('tutorID', user.profileId);
      if (sErr) return res.status(500).json({ success: false, error: sErr.message });
      const subjIds = (subjects || []).map((s: any) => s.subjectID);
      if (subjIds.length === 0) return res.json({ success: true, data: [] });
      const { data, error } = await supabase
        .from('enrollment')
        .select('*, student(*), subject(*)')
        .in('subjectID', subjIds)
        .order('enrollmentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    res.status(403).json({ success: false, error: 'Unauthorized' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /:id
router.get('/:id', authenticate, authorize('admin', 'tutor', 'student', 'parent'), async (req, res) => {
  const id = toId(req.params.id);
  try {
    const user = req.user!;
    const { data, error } = await supabase.from('enrollment').select('*, student(*), subject(*)').eq('enrollmentID', id).single();
    if (error) return res.status(404).json({ success: false, error: error.message });

    // Ownership checks
    if (user.role === 'admin') return res.json({ success: true, data });
    if (user.role === 'student' && data.studentID === user.profileId) return res.json({ success: true, data });
    if (user.role === 'parent') {
      const { data: student } = await supabase.from('student').select('parentID').eq('studentID', data.studentID).single();
      if (student && student.parentID === user.profileId) return res.json({ success: true, data });
    }
    if (user.role === 'tutor') {
      const { data: subject } = await supabase.from('subject').select('tutorID').eq('subjectID', data.subjectID).single();
      if (subject && subject.tutorID === user.profileId) return res.json({ success: true, data });
    }

    return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST / - create (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const payload = req.body;
    const { data, error } = await supabase.from('enrollment').insert(payload).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /:id - update (admin only)
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = toId(req.params.id);
  try {
    const { data, error } = await supabase.from('enrollment').update(req.body).eq('enrollmentID', id).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /:id (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = toId(req.params.id);
  try {
    const { error } = await supabase.from('enrollment').delete().eq('enrollmentID', id);
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
