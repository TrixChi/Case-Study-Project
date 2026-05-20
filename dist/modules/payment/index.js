"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_js_1 = require("../../lib/supabase.js");
const auth_js_1 = require("../../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticate);
async function buildStudentFeeSummary(studentID) {
    const [{ data: student }, { data: enrollments = [], error: enrollError }, { data: payments = [], error: paymentsError }] = await Promise.all([
        supabase_js_1.supabase
            .from('student')
            .select('studentID, stuFirstName, stuLastName')
            .eq('studentID', studentID)
            .single(),
        supabase_js_1.supabase
            .from('enrollment')
            .select('enrollmentDate, subject(subjectID, subjectName, fee)')
            .eq('studentID', studentID)
            .eq('status', 'approved')
            .order('enrollmentDate', { ascending: true }),
        supabase_js_1.supabase
            .from('payment')
            .select('amount, paymentDate, subjectID')
            .eq('studentID', studentID)
            .order('paymentDate', { ascending: true }),
    ]);
    if (enrollError)
        throw enrollError;
    if (paymentsError)
        throw paymentsError;
    const subjectMap = new Map();
    const enrollmentOrder = [];
    (enrollments || []).forEach((enrollment) => {
        const subject = enrollment.subject;
        const subjectID = Number(subject?.subjectID);
        if (!subjectID || subjectMap.has(subjectID))
            return;
        const fee = Number(subject?.fee || 0);
        subjectMap.set(subjectID, {
            subjectID,
            subjectName: String(subject?.subjectName || 'Subject'),
            fee,
            paid: 0,
            balance: fee,
        });
        enrollmentOrder.push(subjectID);
    });
    const orderedSubjects = enrollmentOrder
        .map((subjectID) => subjectMap.get(subjectID))
        .filter((subject) => Boolean(subject));
    for (const payment of payments || []) {
        const amount = Number(payment.amount || 0);
        const paymentSubjectID = payment.subjectID ? Number(payment.subjectID) : null;
        if (paymentSubjectID && subjectMap.has(paymentSubjectID)) {
            const subject = subjectMap.get(paymentSubjectID);
            subject.paid += amount;
            subject.balance = Math.max(0, subject.fee - subject.paid);
            continue;
        }
        let remaining = amount;
        for (const subject of orderedSubjects) {
            if (remaining <= 0)
                break;
            const payable = Math.max(0, subject.fee - subject.paid);
            if (payable <= 0)
                continue;
            const applied = Math.min(payable, remaining);
            subject.paid += applied;
            subject.balance = Math.max(0, subject.fee - subject.paid);
            remaining -= applied;
        }
    }
    const subjects = orderedSubjects.map((subject) => ({
        ...subject,
        balance: Number(subject.balance.toFixed(2)),
        paid: Number(subject.paid.toFixed(2)),
        fee: Number(subject.fee.toFixed(2)),
    }));
    const totalFees = subjects.reduce((sum, subject) => sum + subject.fee, 0);
    const totalPaid = Number((payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0).toFixed(2));
    const missingFees = Number(subjects.reduce((sum, subject) => sum + subject.balance, 0).toFixed(2));
    return {
        studentID,
        stuFirstName: String(student?.stuFirstName || ''),
        stuLastName: String(student?.stuLastName || ''),
        totalFees: Number(totalFees.toFixed(2)),
        totalPaid,
        missingFees,
        subjects,
    };
}
// GET /api/payment
router.get('/', async (req, res) => {
    try {
        const { role, profileId } = req.user;
        let query = supabase_js_1.supabase
            .from('payment')
            .select(`*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName)`)
            .order('paymentDate', { ascending: false });
        if (role === 'student') {
            query = query.eq('studentID', profileId);
        }
        else if (role === 'parent') {
            const { data: students } = await supabase_js_1.supabase
                .from('student')
                .select('studentID')
                .eq('parentID', profileId);
            const ids = (students || []).map((s) => s.studentID);
            query = query.in('studentID', ids.length > 0 ? ids : [0]);
        }
        else if (role === 'tutor') {
            return res.status(403).json({ success: false, error: 'Tutors cannot view payments' });
        }
        const { data, error } = await query;
        if (error)
            throw error;
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});
// GET /api/payment/student/:studentId - get payments + balance for a student
router.get('/student/:studentId', (0, auth_js_1.authorize)('admin'), async (req, res) => {
    try {
        const { data: payments, error } = await supabase_js_1.supabase
            .from('payment')
            .select(`*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName)`)
            .eq('studentID', req.params.studentId)
            .order('paymentDate', { ascending: false });
        if (error)
            throw error;
        const balance = payments && payments.length > 0 ? payments[0].balance : 0;
        return res.json({ success: true, data: { payments, balance } });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});
// GET /api/payment/summary - get per-subject balance and missing fees
router.get('/summary', async (req, res) => {
    try {
        const { role, profileId } = req.user;
        const studentIdParam = req.query.studentID ? Number(req.query.studentID) : null;
        let studentIds = [];
        if (role === 'student') {
            studentIds = [profileId];
        }
        else if (role === 'parent') {
            const { data: students } = await supabase_js_1.supabase
                .from('student')
                .select('studentID')
                .eq('parentID', profileId);
            studentIds = (students || []).map((student) => student.studentID);
        }
        else if (role === 'admin') {
            if (studentIdParam) {
                studentIds = [studentIdParam];
            }
            else {
                const { data: students } = await supabase_js_1.supabase
                    .from('student')
                    .select('studentID');
                studentIds = (students || []).map((student) => student.studentID);
            }
        }
        else {
            return res.status(403).json({ success: false, error: 'Tutors cannot view fee summaries' });
        }
        if (studentIds.length === 0) {
            return res.json({ success: true, data: { students: [], totals: { totalFees: 0, totalPaid: 0, missingFees: 0 } } });
        }
        const summaries = await Promise.all(studentIds.map((studentID) => buildStudentFeeSummary(studentID)));
        const totals = summaries.reduce((accumulator, summary) => ({
            totalFees: Number((accumulator.totalFees + summary.totalFees).toFixed(2)),
            totalPaid: Number((accumulator.totalPaid + summary.totalPaid).toFixed(2)),
            missingFees: Number((accumulator.missingFees + summary.missingFees).toFixed(2)),
        }), { totalFees: 0, totalPaid: 0, missingFees: 0 });
        return res.json({
            success: true,
            data: studentIdParam || role === 'student' ? summaries[0] : { students: summaries, totals },
        });
    }
    catch (err) {
        console.error('GET /payment/summary failed', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});
// POST /api/payment - admin records payment
router.post('/', (0, auth_js_1.authorize)('admin'), async (req, res) => {
    try {
        const { studentID, amount, receiptNo, subjectID } = req.body;
        if (!studentID || !amount) {
            return res.status(400).json({ success: false, error: 'studentID and amount required' });
        }
        const { data: lastPayment } = await supabase_js_1.supabase
            .from('payment')
            .select('balance')
            .eq('studentID', studentID)
            .order('paymentDate', { ascending: false })
            .limit(1)
            .single();
        const currentBalance = lastPayment ? Number(lastPayment.balance) : 0;
        const newBalance = Math.max(0, currentBalance - Number(amount));
        const generatedReceiptNo = receiptNo || `RCT-${Date.now()}`;
        const { data, error } = await supabase_js_1.supabase
            .from('payment')
            .insert({
            studentID,
            subjectID: subjectID || null,
            amount: Number(amount),
            paymentDate: new Date().toISOString(),
            receiptNo: generatedReceiptNo,
            balance: newBalance,
        })
            .select(`*, student(studentID, stuFirstName, stuLastName), subject(subjectID, subjectName)`)
            .single();
        if (error)
            throw error;
        return res.status(201).json({ success: true, data, message: 'Payment recorded' });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});
// PATCH /api/payment/:id - admin updates payment
router.patch('/:id', (0, auth_js_1.authorize)('admin'), async (req, res) => {
    try {
        const { amount, receiptNo } = req.body;
        const { data, error } = await supabase_js_1.supabase
            .from('payment')
            .update({ amount, receiptNo })
            .eq('paymentID', req.params.id)
            .select()
            .single();
        if (error)
            throw error;
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});
// DELETE /api/payment/:id - admin only
router.delete('/:id', (0, auth_js_1.authorize)('admin'), async (req, res) => {
    try {
        const { error } = await supabase_js_1.supabase
            .from('payment')
            .delete()
            .eq('paymentID', req.params.id);
        if (error)
            throw error;
        return res.json({ success: true, message: 'Payment deleted' });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});
exports.default = router;
//# sourceMappingURL=index.js.map