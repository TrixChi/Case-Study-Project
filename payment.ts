import { Router, Response } from 'express';
import { supabase } from './src/lib/supabase.js';
import { authenticate, authorize, AuthRequest } from './src/middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/payment
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { role, profileId } = req.user!;
    let query = supabase
      .from('payment')
      .select(`*, student(studentID, stuFirstName, stuLastName)`)
      .order('paymentDate', { ascending: false });

    if (role === 'student') {
      query = query.eq('studentID', profileId);
    } else if (role === 'parent') {
      const { data: students } = await supabase
        .from('student')
        .select('studentID')
        .eq('parentID', profileId);
      const ids = (students || []).map((s: { studentID: number }) => s.studentID);
      query = query.in('studentID', ids.length > 0 ? ids : [0]);
    } else if (role === 'tutor') {
      return res.status(403).json({ success: false, error: 'Tutors cannot view payments' });
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/payment/student/:studentId - get payments + balance for a student
router.get('/student/:studentId', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { data: payments, error } = await supabase
      .from('payment')
      .select(`*, student(studentID, stuFirstName, stuLastName)`)
      .eq('studentID', req.params.studentId)
      .order('paymentDate', { ascending: false });

    if (error) throw error;

    const balance = payments && payments.length > 0 ? payments[0].balance : 0;
    return res.json({ success: true, data: { payments, balance } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/payment - admin records payment
router.post('/', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { studentID, amount, receiptNo } = req.body;
    if (!studentID || !amount) {
      return res.status(400).json({ success: false, error: 'studentID and amount required' });
    }

    // Get current balance
    const { data: lastPayment } = await supabase
      .from('payment')
      .select('balance')
      .eq('studentID', studentID)
      .order('paymentDate', { ascending: false })
      .limit(1)
      .single();

    const currentBalance = lastPayment ? Number(lastPayment.balance) : 0;
    const newBalance = Math.max(0, currentBalance - Number(amount));

    const generatedReceiptNo = receiptNo || `RCT-${Date.now()}`;

    const { data, error } = await supabase
      .from('payment')
      .insert({
        studentID,
        amount: Number(amount),
        paymentDate: new Date().toISOString(),
        receiptNo: generatedReceiptNo,
        balance: newBalance,
      })
      .select(`*, student(studentID, stuFirstName, stuLastName)`)
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, data, message: 'Payment recorded' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/payment/:id - admin updates payment
router.patch('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, receiptNo } = req.body;
    const { data, error } = await supabase
      .from('payment')
      .update({ amount, receiptNo })
      .eq('paymentID', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/payment/:id - admin only
router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase
      .from('payment')
      .delete()
      .eq('paymentID', req.params.id);
    if (error) throw error;
    return res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
