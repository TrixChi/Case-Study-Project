import { Router } from 'express';
import { supabase } from '../../src/lib/supabase';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// GET / - list payments with ownership filtering
router.get('/', authenticate, authorize('admin', 'parent', 'student'), async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const { data, error } = await supabase.from('payment').select('*, student(*)').order('paymentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'student') {
      const { data, error } = await supabase.from('payment').select('*, student(*)').eq('studentID', user.profileId).order('paymentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    if (user.role === 'parent') {
      const { data: kids, error: kErr } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
      if (kErr) return res.status(500).json({ success: false, error: kErr.message });
      const ids = (kids || []).map((s: any) => s.studentID);
      const { data, error } = await supabase.from('payment').select('*, student(*)').in('studentID', ids).order('paymentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    res.status(403).json({ success: false, error: 'Unauthorized' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /student/:studentId
router.get('/student/:studentId', authenticate, authorize('admin', 'parent', 'student'), async (req, res) => {
  const studentId = Number(req.params.studentId);
  try {
    const user = req.user!;
    // Admin can request any student's payments
    if (user.role === 'admin') {
      const { data, error } = await supabase.from('payment').select('*').eq('studentID', studentId).order('paymentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    // Student can request only their own
    if (user.role === 'student' && user.profileId === studentId) {
      const { data, error } = await supabase.from('payment').select('*').eq('studentID', studentId).order('paymentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    // Parent can request only their children's
    if (user.role === 'parent') {
      const { data: kids, error: kErr } = await supabase.from('student').select('studentID').eq('parentID', user.profileId);
      if (kErr) return res.status(500).json({ success: false, error: kErr.message });
      const ids = (kids || []).map((s: any) => s.studentID);
      if (!ids.includes(studentId)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { data, error } = await supabase.from('payment').select('*').eq('studentID', studentId).order('paymentDate', { ascending: false });
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }

    res.status(403).json({ success: false, error: 'Insufficient permissions' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST / - create payment
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const payload = req.body;
    const { data, error } = await supabase.from('payment').insert(payload).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /:id
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { data, error } = await supabase.from('payment').update(req.body).eq('paymentID', id).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { error } = await supabase.from('payment').delete().eq('paymentID', id);
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
