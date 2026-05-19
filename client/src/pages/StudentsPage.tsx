import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Student, Parent } from '../types';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ActionButtons from '../components/ActionButtons';
import StatusSelector from '../components/StatusSelector';
import { STUDENT_STATUS_BADGES } from '../styles/design';
import toast from 'react-hot-toast';

const emptyForm = {
  email: '',
  password: '',
  stuFirstName: '', stuMiddleName: '', stuLastName: '',
  stuContactInfo: '', address: '', status: 'enrolled', parentID: '',
};

const statusOptions = [
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'missing fees', label: 'Missing Fees' },
] as const;

const generateStudentEmail = (firstName: string, lastName: string) => {
  return `${lastName.trim().toLowerCase()}.${firstName
    .trim()
    .toLowerCase()}@abclearning.com`;
};

const DEFAULT_PASSWORD = 'ABClearning2026';

export default function StudentsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  const { data: students = [], isLoading, isError, error } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const res = await api.get('/records/students');
      return res.data.data as Student[];
    },
  });

  const { data: parents = [] } = useQuery({
    queryKey: ['parents'],
    queryFn: async () => {
      const res = await api.get('/records/parents');
      return res.data.data as Parent[];
    },
    enabled: isAdmin,
  });

  const parentNameById = parents.reduce<Record<number, string>>((accumulator, parent) => {
    accumulator[parent.parentID] = `${parent.parentFirstName} ${parent.parentLastName}`.trim();
    return accumulator;
  }, {});

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      email: s.email || generateStudentEmail(s.stuFirstName, s.stuLastName),
      password: '',
      stuFirstName: s.stuFirstName,
      stuMiddleName: s.stuMiddleName || '',
      stuLastName: s.stuLastName,
      stuContactInfo: s.stuContactInfo,
      address: s.address,
      status: s.status,
      parentID: s.parentID?.toString() || '',
    });
    setShowModal(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/records/students', {
        ...data,
        email: data.email || generateStudentEmail(data.stuFirstName, data.stuLastName),
        parentID: data.parentID ? Number(data.parentID) : undefined,
      }),
    onSuccess: () => { toast.success('Student added'); qc.invalidateQueries({ queryKey: ['students'] }); setShowModal(false); },
    onError: () => toast.error('Failed to add student'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.patch(`/records/students/${editing?.studentID}`, {
        email: data.email || generateStudentEmail(data.stuFirstName, data.stuLastName),
        stuFirstName: data.stuFirstName,
        stuMiddleName: data.stuMiddleName,
        stuLastName: data.stuLastName,
        stuContactInfo: data.stuContactInfo,
        address: data.address,
        status: data.status,
        parentID: data.parentID ? Number(data.parentID) : null,
        password: data.password?.trim() || DEFAULT_PASSWORD,
      }),
    onSuccess: () => { toast.success('Student updated'); qc.invalidateQueries({ queryKey: ['students'] }); setShowModal(false); },
    onError: (error: { response?: { data?: { error?: string } } }) => toast.error(error.response?.data?.error || 'Failed to update student'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/records/students/${id}`),
    onSuccess: () => { toast.success('Student deleted'); qc.invalidateQueries({ queryKey: ['students'] }); setDeleteTarget(null); },
    onError: () => toast.error('Failed to delete'),
  });

  const filtered = students.filter(s =>
    search === '' ||
    `${s.stuFirstName} ${s.stuLastName}`.toLowerCase().includes(search.toLowerCase()) ||
    s.stuContactInfo?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = () => {
    if (editing) {
      updateMutation.mutate(form);
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="text-sm text-surface-500 mt-1">{students.length} enrolled students</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Student
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text"
          placeholder="Search students…"
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
        ) : isError ? (
          <div className="px-5 py-8 text-center text-red-600">
            <p className="text-sm font-medium">Unable to load students</p>
            <p className="text-xs text-red-500 mt-1">{(error as { message?: string })?.message || 'Check the records API route and Supabase connection.'}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header border-b border-surface-100">
                  <th className="table-cell text-left">ID</th>
                  <th className="table-cell text-left">Name</th>
                  <th className="table-cell text-left">Contact</th>
                  <th className="table-cell text-left">Address</th>
                  <th className="table-cell text-left">Status</th>
                  <th className="table-cell text-left">Parent/Guardian</th>
                  {isAdmin && <th className="table-cell text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((s) => (
                  <tr key={s.studentID} className="table-row-hover">
                    <td className="table-cell font-mono text-xs text-surface-400">#{s.studentID}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-semibold">
                            {(s.stuFirstName?.[0] ?? '')}{(s.stuLastName?.[0] ?? '')}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-surface-800">
                            {s.stuFirstName || ''} {s.stuMiddleName ? s.stuMiddleName[0] + '. ' : ''}{s.stuLastName || ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-surface-500">{s.stuContactInfo || '—'}</td>
                    <td className="table-cell text-surface-500 max-w-[200px] truncate">{s.address || '—'}</td>
                    <td className="table-cell">
                      <span className={`badge ${STUDENT_STATUS_BADGES[s.status] || 'badge-gray'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="table-cell text-surface-500">
                      {s.parentID ? parentNameById[s.parentID] || `Parent #${s.parentID}` : '—'}
                    </td>
                    {isAdmin && (
                      <td className="table-cell text-right">
                        <ActionButtons onEdit={() => openEdit(s)} onDelete={() => setDeleteTarget(s)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Student' : 'Add Student'}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email *</label>
            <input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="student@ABClearning.com" />
          </div>
          <div>
            <label className="label">Password *</label>
            <input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank for default password" />
          </div>
          <div>
            <label className="label">First Name *</label>
            <input className="input" value={form.stuFirstName} onChange={e => setForm(f => {
              const stuFirstName = e.target.value;
              const email = stuFirstName && f.stuLastName ? generateStudentEmail(stuFirstName, f.stuLastName) : f.email;
              return { ...f, stuFirstName, email };
            })} placeholder="Juan" />
          </div>
          <div>
            <label className="label">Middle Name</label>
            <input className="input" value={form.stuMiddleName} onChange={e => setForm(f => ({ ...f, stuMiddleName: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input className="input" value={form.stuLastName} onChange={e => setForm(f => {
              const stuLastName = e.target.value;
              const email = f.stuFirstName && stuLastName ? generateStudentEmail(f.stuFirstName, stuLastName) : f.email;
              return { ...f, stuLastName, email };
            })} placeholder="Dela Cruz" />
          </div>
          <div>
            <label className="label">Contact Info</label>
            <input className="input" value={form.stuContactInfo} onChange={e => setForm(f => ({ ...f, stuContactInfo: e.target.value }))} placeholder="09XXXXXXXXX" />
          </div>
          <div className="col-span-2">
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street, Barangay, City" />
          </div>
          <div className="col-span-2">
            <label className="label">Status</label>
            <StatusSelector options={statusOptions as any} value={form.status} onChange={(v) => setForm(f => ({ ...f, status: v }))} />
          </div>
          <div className="col-span-2">
            <label className="label">Parent/Guardian</label>
            <select className="input" value={form.parentID} onChange={e => setForm(f => ({ ...f, parentID: e.target.value }))}>
              <option value="">None</option>
              {parents.map(p => (
                <option key={p.parentID} value={p.parentID}>
                  {p.parentFirstName} {p.parentLastName} ({p.relationship})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setShowModal(false);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                !form.email ||
                !form.stuFirstName ||
                !form.stuLastName ||
                !form.stuContactInfo ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              className="btn-primary"
            >
              {editing ? 'Update Student' : 'Add Student'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Student"
        message={`Delete ${deleteTarget?.stuFirstName || 'this student'} ${deleteTarget?.stuLastName || ''}? This action cannot be undone.`}
        confirmLabel="Delete Student"
        isProcessing={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.studentID)}
      />
    </div>
  );
}
