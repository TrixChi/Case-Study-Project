import { Router } from 'express';
import { supabase } from '../../src/lib/supabase';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Grades
router.get('/grades', authenticate, authorize('admin', 'tutor', 'student', 'parent'), async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const { data, error } = await supabase.from('grade').select('*, student(*), subject(*), tutor(*)').order('gradeID', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'student') {
      const { data, error } = await supabase.from('grade').select('*, student(*), subject(*), tutor(*)').eq('studentID', user.profileId).order('gradeID', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'parent') {
      const { data: kids, error: kErr } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
      if (kErr) return res.status(500).json({ success: false, error: kErr.message });
      const ids = (kids || []).map((s: any) => s.studentID);
      const { data, error } = await supabase.from('grade').select('*, student(*), subject(*), tutor(*)').in('studentID', ids).order('gradeID', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'tutor') {
      const { data: subjects, error: sErr } = await supabase.from('subject').select('subjectID').eq('tutorID', user.profileId);
      if (sErr) return res.status(500).json({ success: false, error: sErr.message });
      const subjIds = (subjects || []).map((s: any) => s.subjectID);
      const { data, error } = await supabase.from('grade').select('*, student(*), subject(*), tutor(*)').in('subjectID', subjIds).order('gradeID', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    res.status(403).json({ success: false, error: 'Unauthorized' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post('/grades', authenticate, authorize('admin', 'tutor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('grade').insert(req.body).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.patch('/grades/:id', authenticate, authorize('admin', 'tutor'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { data, error } = await supabase.from('grade').update(req.body).eq('gradeID', id).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.patch('/grades/:id/release', authenticate, authorize('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { released } = req.body;
  try {
    const { data, error } = await supabase.from('grade').update({ released }).eq('gradeID', id).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// Attendance
router.get('/attendance', authenticate, authorize('admin', 'tutor', 'student', 'parent'), async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const { data, error } = await supabase.from('attendance').select('*, student(*), subject(*), tutor(*)').order('attendanceDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'student') {
      const { data, error } = await supabase.from('attendance').select('*, student(*), subject(*), tutor(*)').eq('studentID', user.profileId).order('attendanceDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'parent') {
      const { data: kids, error: kErr } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
      if (kErr) return res.status(500).json({ success: false, error: kErr.message });
      const ids = (kids || []).map((s: any) => s.studentID);
      const { data, error } = await supabase.from('attendance').select('*, student(*), subject(*), tutor(*)').in('studentID', ids).order('attendanceDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'tutor') {
      const { data: rows, error: tErr } = await supabase.from('attendance').select('*').eq('tutorID', user.profileId);
      if (tErr) return res.status(500).json({ success: false, error: tErr.message });
      const ids = (rows || []).map((r: any) => r.attendanceID);
      const { data, error } = await supabase.from('attendance').select('*, student(*), subject(*), tutor(*)').in('attendanceID', ids).order('attendanceDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    res.status(403).json({ success: false, error: 'Unauthorized' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post('/attendance', authenticate, authorize('admin', 'tutor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('attendance').insert(req.body).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.patch('/attendance/:id', authenticate, authorize('admin', 'tutor'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { data, error } = await supabase.from('attendance').update(req.body).eq('attendanceID', id).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.patch('/attendance/:id/release', authenticate, authorize('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { released } = req.body;
  try {
    const { data, error } = await supabase.from('attendance').update({ released }).eq('attendanceID', id).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// Transcript
router.get('/transcripts', authenticate, authorize('admin', 'tutor', 'student', 'parent'), async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const { data, error } = await supabase.from('transcript').select('*, student(*)').order('dateGenerated', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'student') {
      const { data, error } = await supabase.from('transcript').select('*, student(*)').eq('studentID', user.profileId).order('dateGenerated', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'parent') {
      const { data: kids, error: kErr } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
      if (kErr) return res.status(500).json({ success: false, error: kErr.message });
      const ids = (kids || []).map((s: any) => s.studentID);
      const { data, error } = await supabase.from('transcript').select('*, student(*)').in('studentID', ids).order('dateGenerated', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    // tutors generally don't own transcripts
    res.status(403).json({ success: false, error: 'Unauthorized' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post('/transcripts', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('transcript').insert(req.body).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
