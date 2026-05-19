import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, GraduationCap, Pencil, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Tutor } from '../types';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ActionButtons from '../components/ActionButtons';
import StatusSelector from '../components/StatusSelector';
import { TUTOR_STATUS_BADGES } from '../styles/design';
import toast from 'react-hot-toast';

const emptyForm = {
  email: '',
  password: '',
  tutorFirstName: '',
  tutorLastName: '',
  specialization: '',
  status: 'active' as 'active' | 'on leave' | 'dismissed',
};

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'on leave', label: 'On Leave' },
  { value: 'dismissed', label: 'Dismissed' },
] as const;

export default function TutorsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tutor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Tutor | null>(null);

  const { data: tutors = [], isLoading } = useQuery({
    queryKey: ['tutors'],
    queryFn: async () => {
      const res = await api.get('/records/tutors');
      return res.data.data as Tutor[];
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
  mutationFn: (data: typeof form) =>
    api.post('/records/tutors', {
      ...data,
      password: data.password?.trim() || 'ABClearning2026',
    }),

  onSuccess: () => {
    toast.success('Tutor added');
    qc.invalidateQueries({ queryKey: ['tutors'] });
    setShowModal(false);
    setForm(emptyForm);
  },

  onError: (err: { response?: { data?: { error?: string } } }) => {
    toast.error(err.response?.data?.error || 'Failed to add tutor');
  },
});

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => api.patch(`/records/tutors/${editing?.tutorID}`, data),
    onSuccess: () => {
      toast.success('Tutor updated');
      qc.invalidateQueries({ queryKey: ['tutors'] });
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to update tutor');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/records/tutors/${id}`),
    onSuccess: () => {
      toast.success('Tutor deleted');
      qc.invalidateQueries({ queryKey: ['tutors'] });
      setDeleteTarget(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to delete tutor');
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (tutor: Tutor) => {
    setEditing(tutor);
    setForm({
      email: tutor.email || '',
      password: '',
      tutorFirstName: tutor.tutorFirstName,
      tutorLastName: tutor.tutorLastName,
      specialization: tutor.specialization,
      status: tutor.status || 'active',
    });
    setShowModal(true);
  };

  const filtered = tutors.filter(t =>
    search === '' ||
    `${t.tutorFirstName} ${t.tutorLastName}`.toLowerCase().includes(search.toLowerCase()) ||
    t.specialization?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Tutors</h1>
          <p className="text-sm text-surface-500 mt-1">{tutors.length} tutor records</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Tutor
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text"
          placeholder="Search tutors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No tutors found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header border-b border-surface-100">
                  <th className="table-cell text-left">ID</th>
                  <th className="table-cell text-left">Name</th>
                  <th className="table-cell text-left">Specialization</th>
                  <th className="table-cell text-left">Status</th>
                  <th className="table-cell text-left">Email</th>
                  {isAdmin && <th className="table-cell text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((t) => (
                  <tr key={t.tutorID} className="table-row-hover">
                    <td className="table-cell font-mono text-xs text-surface-400">#{t.tutorID}</td>
                    <td className="table-cell font-medium">{t.tutorFirstName} {t.tutorLastName}</td>
                    <td className="table-cell text-surface-500">{t.specialization || '—'}</td>
                    <td className="table-cell">
                      <span className={`badge ${TUTOR_STATUS_BADGES[t.status] || 'badge-gray'}`}>{t.status}</span>
                    </td>
                    <td className="table-cell text-surface-500">{t.email || '—'}</td>
                    {isAdmin && (
                      <td className="table-cell text-right">
                        <ActionButtons onEdit={() => openEdit(t)} onDelete={() => setDeleteTarget(t)} showDelete={t.status === 'dismissed'} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Tutor' : 'Add Tutor'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email *</label>
            <input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tutor@ABClearning.com" />
          </div>
          <div>
            <label className="label">Password *</label>
            <input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank for default password" />
          </div>
          <div>
            <label className="label">First Name *</label>
            <input className="input" value={form.tutorFirstName} onChange={e => setForm(f => ({ ...f, tutorFirstName: e.target.value }))} placeholder="Juan" />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input className="input" value={form.tutorLastName} onChange={e => setForm(f => ({ ...f, tutorLastName: e.target.value }))} placeholder="Dela Cruz" />
          </div>
          <div className="col-span-2">
            <label className="label">Specialization *</label>
            <input className="input" value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} placeholder="Mathematics" />
          </div>
          <div className="col-span-2">
            <label className="label">Status *</label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: option.value }))}
                  className={`seg-btn ${form.status === option.value ? 'seg-btn--active' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => editing ? updateMutation.mutate(form) : createMutation.mutate(form)}
              disabled={!form.email || !form.tutorFirstName || !form.tutorLastName || !form.specialization || createMutation.isPending || updateMutation.isPending}
              className="btn-primary"
            >
              {editing ? (updateMutation.isPending ? 'Updating…' : 'Update Tutor') : (createMutation.isPending ? 'Saving…' : 'Add Tutor')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Tutor"
        message={`Delete ${deleteTarget?.tutorFirstName || 'this tutor'} ${deleteTarget?.tutorLastName || ''}? This is only available for dismissed tutors.`}
        confirmLabel="Delete Tutor"
        isProcessing={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.tutorID)}
      />
    </div>
  );
}