import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Search, Receipt } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Payment, Student } from '../types';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import toast from 'react-hot-toast';
import ActionButtons from '../components/ActionButtons';

export default function PaymentPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [form, setForm] = useState({ studentID: '', amount: '', receiptNo: '' });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payment'],
    queryFn: async () => {
      const res = await api.get('/payment');
      return res.data.data as Payment[];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const res = await api.get('/records/students');
      return res.data.data as Student[];
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: { studentID: number; amount: number; receiptNo?: string }) =>
      api.post('/payment', data),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['payment'] });
      setShowModal(false);
      setForm({ studentID: '', amount: '', receiptNo: '' });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/payment/${id}`),
    onSuccess: () => {
      toast.success('Payment deleted');
      qc.invalidateQueries({ queryKey: ['payment'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete'),
  });

  const filtered = payments.filter(p =>
    search === '' ||
    `${p.student?.stuFirstName} ${p.student?.stuLastName}`.toLowerCase().includes(search.toLowerCase()) ||
    p.receiptNo?.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filtered.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="text-sm text-surface-500 mt-1">{payments.length} transactions · Total: ₱{totalAmount.toLocaleString()}</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text"
          placeholder="Search by student or receipt…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No payment records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header border-b border-surface-100">
                  <th className="table-cell text-left">Receipt No.</th>
                  <th className="table-cell text-left">Student</th>
                  <th className="table-cell text-right">Amount</th>
                  <th className="table-cell text-right">Balance</th>
                  <th className="table-cell text-left">Date</th>
                  {isAdmin && <th className="table-cell text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((p) => (
                  <tr key={p.paymentID} className="table-row-hover">
                    <td className="table-cell">
                      <span className="font-mono text-xs bg-surface-100 px-2 py-0.5 rounded text-surface-700">
                        {p.receiptNo}
                      </span>
                    </td>
                    <td className="table-cell font-medium">
                      {p.student?.stuFirstName} {p.student?.stuLastName}
                    </td>
                    <td className="table-cell text-right font-semibold text-emerald-700">
                      ₱{Number(p.amount).toLocaleString()}
                    </td>
                    <td className="table-cell text-right">
                      <span className={`font-medium ${Number(p.balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ₱{Number(p.balance).toLocaleString()}
                      </span>
                    </td>
                    <td className="table-cell text-surface-500">
                      {new Date(p.paymentDate).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="table-cell text-right">
                        <ActionButtons onDelete={() => setDeleteTarget(p)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Payment">
        <div className="space-y-4">
          <div>
            <label className="label">Student *</label>
            <select
              value={form.studentID}
              onChange={e => setForm(f => ({ ...f, studentID: e.target.value }))}
              className="input"
            >
              <option value="">Select student…</option>
              {students.map(s => (
                <option key={s.studentID} value={s.studentID}>
                  {s.stuFirstName} {s.stuLastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount (₱) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="label">Receipt No. (optional)</label>
            <input
              type="text"
              placeholder="Auto-generated if empty"
              value={form.receiptNo}
              onChange={e => setForm(f => ({ ...f, receiptNo: e.target.value }))}
              className="input"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => createMutation.mutate({
                studentID: Number(form.studentID),
                amount: Number(form.amount),
                receiptNo: form.receiptNo || undefined,
              })}
              disabled={!form.studentID || !form.amount || createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Payment"
        message={`Delete payment record ${deleteTarget?.receiptNo || ''}? This action cannot be undone.`}
        confirmLabel="Delete Payment"
        isProcessing={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.paymentID)}
      />
    </div>
  );
}
