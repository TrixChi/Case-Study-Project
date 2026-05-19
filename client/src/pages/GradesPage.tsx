import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, GraduationCap } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Grade, Student, Subject } from '../types';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const emptyForm = { studentID: '', subjectID: '', gradeValue: '', tutorID: '' };

export default function GradesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const canEdit = user?.role === 'admin' || user?.role === 'tutor';
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [filterStanding, setFilterStanding] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['grades'],
    queryFn: async () => {
      const res = await api.get('/records/grades');
      return res.data.data as Grade[];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => { const res = await api.get('/records/students'); return res.data.data as Student[]; },
    enabled: canEdit,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => { const res = await api.get('/records/subjects'); return res.data.data as Subject[]; },
    enabled: canEdit,
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (g: Grade) => {
    setEditing(g);
    setForm({ studentID: String(g.studentID), subjectID: String(g.subjectID), gradeValue: String(g.gradeValue), tutorID: String(g.tutorID) });
    setShowModal(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/records/grades', { studentID: Number(data.studentID), subjectID: Number(data.subjectID), gradeValue: Number(data.gradeValue), tutorID: data.tutorID ? Number(data.tutorID) : undefined }),
    onSuccess: () => { toast.success('Grade recorded'); qc.invalidateQueries({ queryKey: ['grades'] }); setShowModal(false); },
    onError: () => toast.error('Failed to record grade'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => api.patch(`/records/grades/${editing?.gradeID}`, { gradeValue: Number(data.gradeValue) }),
    onSuccess: () => { toast.success('Grade updated'); qc.invalidateQueries({ queryKey: ['grades'] }); setShowModal(false); },
    onError: () => toast.error('Failed to update grade'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/records/grades/${id}`),
    onSuccess: () => { toast.success('Grade deleted'); qc.invalidateQueries({ queryKey: ['grades'] }); },
    onError: () => toast.error('Failed to delete'),
  });

  const filtered = grades.filter(g => {
    const matchSearch = search === '' ||
      `${g.student?.stuFirstName} ${g.student?.stuLastName}`.toLowerCase().includes(search.toLowerCase()) ||
      g.subject?.subjectName?.toLowerCase().includes(search.toLowerCase());
    const matchStanding = filterStanding === 'all' || g.academicStanding === filterStanding;
    return matchSearch && matchStanding;
  });

  const getGradeColor = (val: number) => {
    if (val >= 90) return 'text-emerald-700 font-bold';
    if (val >= 75) return 'text-blue-700 font-semibold';
    return 'text-red-600 font-semibold';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Grades</h1>
          <p className="text-sm text-surface-500 mt-1">{grades.length} grade records</p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Grade
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input type="text" placeholder="Search student or subject…" value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" />
        </div>
        <select value={filterStanding} onChange={e => setFilterStanding(e.target.value)} className="input w-auto">
          <option value="all">All Standing</option>
          <option value="Passed">Passed</option>
          <option value="Failed">Failed</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No grade records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header border-b border-surface-100">
                  <th className="table-cell text-left">Student</th>
                  <th className="table-cell text-left">Subject</th>
                  <th className="table-cell text-left">Tutor</th>
                  <th className="table-cell text-center">Grade</th>
                  <th className="table-cell text-left">Standing</th>
                  {canEdit && <th className="table-cell text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((g) => (
                  <tr key={g.gradeID} className="hover:bg-surface-50/50 transition-colors">
                    <td className="table-cell font-medium">{g.student?.stuFirstName} {g.student?.stuLastName}</td>
                    <td className="table-cell">{g.subject?.subjectName}</td>
                    <td className="table-cell text-surface-500">
                      {g.tutor ? `${g.tutor.tutorFirstName} ${g.tutor.tutorLastName}` : '—'}
                    </td>
                    <td className={`table-cell text-center text-lg ${getGradeColor(g.gradeValue)}`}>
                      {g.gradeValue}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${g.academicStanding === 'Passed' ? 'badge-green' : 'badge-red'}`}>
                        {g.academicStanding}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openEdit(g)} className="p-1.5 hover:bg-blue-50 text-surface-400 hover:text-blue-600 rounded-lg transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button onClick={() => { if (confirm('Delete this grade?')) deleteMutation.mutate(g.gradeID); }} className="p-1.5 hover:bg-red-50 text-surface-400 hover:text-red-500 rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Grade' : 'Record Grade'}>
        <div className="space-y-4">
          {!editing && (
            <>
              <div>
                <label className="label">Student *</label>
                <select className="input" value={form.studentID} onChange={e => setForm(f => ({ ...f, studentID: e.target.value }))}>
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s.studentID} value={s.studentID}>{s.stuFirstName} {s.stuLastName}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Subject *</label>
                <select className="input" value={form.subjectID} onChange={e => setForm(f => ({ ...f, subjectID: e.target.value }))}>
                  <option value="">Select subject…</option>
                  {subjects.map(s => <option key={s.subjectID} value={s.subjectID}>{s.subjectName}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="label">Grade (0–100) *</label>
            <input type="number" min="0" max="100" className="input" value={form.gradeValue} onChange={e => setForm(f => ({ ...f, gradeValue: e.target.value }))} placeholder="e.g. 85" />
            {form.gradeValue && (
              <p className={`text-xs mt-1 ${Number(form.gradeValue) >= 75 ? 'text-emerald-600' : 'text-red-500'}`}>
                → {Number(form.gradeValue) >= 75 ? 'Passed' : 'Failed'}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => editing ? updateMutation.mutate(form) : createMutation.mutate(form)}
              disabled={!form.gradeValue || (!editing && (!form.studentID || !form.subjectID))}
              className="btn-primary"
            >
              {editing ? 'Update Grade' : 'Record Grade'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
