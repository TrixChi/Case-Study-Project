import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, BookOpen, Send } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Subject, Tutor, Enlistment, Grade } from '../types';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ActionButtons from '../components/ActionButtons';
import { ENROLLMENT_STATUS_BADGES } from '../styles/design';
import toast from 'react-hot-toast';

type SubjectForm = {
  subjectName: string;
  units: string;
  description: string;
  tutorID: string;
  fee: string;
};

const emptyForm: SubjectForm = {
  subjectName: '',
  units: '',
  description: '',
  tutorID: '',
  fee: '',
};

export default function SubjectsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState<SubjectForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<number>>(new Set());

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      const res = await api.get('/records/subjects');
      return res.data.data as Subject[];
    },
  });

  const { data: tutors = [] } = useQuery({
    queryKey: ['tutors'],
    queryFn: async () => {
      const res = await api.get('/records/tutors');
      return res.data.data as Tutor[];
    },
    enabled: isAdmin,
  });

  const { data: myGrades = [] } = useQuery({
    queryKey: ['grades'],
    queryFn: async () => {
      const res = await api.get('/records/grades');
      return res.data.data as Grade[];
    },
    enabled: isStudent,
  });

  const passingSubjects = useMemo(
    () => new Set(myGrades.filter((g) => g.academicStanding === 'Passed').map((g) => g.subjectID)),
    [myGrades]
  );

  const tutorLookup = useMemo(() => new Map(tutors.map((t) => [t.tutorID, t])), [tutors]);

  const { data: myEnlistments = [] } = useQuery({
    queryKey: ['enlistment'],
    queryFn: async () => {
      const res = await api.get('/enlistment');
      return res.data.data as Enlistment[];
    },
    enabled: isStudent,
  });

  const enlistmentBySubject = useMemo(
    () => new Map(myEnlistments.map((e) => [e.subjectID, e])),
    [myEnlistments]
  );

  const enlistMutation = useMutation({
    mutationFn: (subjectIDs: number[]) => api.post('/enlistment', { subjectIDs }),
    onSuccess: (_data, subjectIDs) => {
      toast.success(`${subjectIDs.length} enlistment${subjectIDs.length > 1 ? 's' : ''} submitted — awaiting approval`);
      qc.invalidateQueries({ queryKey: ['enlistment'] });
      setSelectedSubjects(new Set());
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to submit enlistment');
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (subject: Subject) => {
    setEditing(subject);
    setForm({
      subjectName: subject.subjectName,
      units: String(subject.units),
      description: subject.description || '',
      tutorID: subject.tutorID ? String(subject.tutorID) : '',
      fee: Number(subject.fee || 0).toFixed(2),
    });
    setShowModal(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: SubjectForm) =>
      api.post('/records/subjects', {
        subjectName: data.subjectName,
        units: Number(data.units),
        description: data.description || undefined,
        ...(data.tutorID ? { tutorID: Number(data.tutorID) } : {}),
        fee: data.fee,
      }),
    onSuccess: () => {
      toast.success('Subject added');
      qc.invalidateQueries({ queryKey: ['subjects'] });
      setShowModal(false);
      setForm(emptyForm);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to add subject');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: SubjectForm) =>
      api.patch(`/records/subjects/${editing?.subjectID}`, {
        subjectName: data.subjectName,
        units: Number(data.units),
        description: data.description || null,
        tutorID: data.tutorID ? Number(data.tutorID) : null,
        fee: data.fee,
      }),
    onSuccess: () => {
      toast.success('Subject updated');
      qc.invalidateQueries({ queryKey: ['subjects'] });
      setShowModal(false);
      setForm(emptyForm);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to update subject');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/records/subjects/${id}`),
    onSuccess: () => {
      toast.success('Subject deleted');
      qc.invalidateQueries({ queryKey: ['subjects'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete subject'),
  });

  const filtered = subjects.filter((subject) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const tutor = subject.tutor ? `${subject.tutor.tutorFirstName} ${subject.tutor.tutorLastName}` : '';
    return (
      subject.subjectName.toLowerCase().includes(term) ||
      String(subject.units).includes(term) ||
      (subject.description || '').toLowerCase().includes(term) ||
      tutor.toLowerCase().includes(term)
    );
  });

  const handleSubmit = () => {
    if (editing) updateMutation.mutate(form);
    else createMutation.mutate(form);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Subjects</h1>
          <p className="text-sm text-surface-500 mt-1">{subjects.length} subject records</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Subject
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text"
          placeholder="Search subjects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No subjects found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header border-b border-surface-100">
                  <th className="table-cell text-left">ID</th>
                  <th className="table-cell text-left">Subject</th>
                  <th className="table-cell text-left">Units</th>
                  <th className="table-cell text-left">Description</th>
                  <th className="table-cell text-left">Tutor</th>
                  <th className="table-cell text-left">Fee</th>
                  {isStudent && <th className="table-cell text-left">Enlist</th>}
                  {isAdmin && <th className="table-cell text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((subject) => {
                  const tutor = subject.tutor || (subject.tutorID ? tutorLookup.get(subject.tutorID) : undefined);
                    return (
                    <tr key={subject.subjectID} className="table-row-hover">
                      <td className="table-cell font-mono text-xs text-surface-400">#{subject.subjectID}</td>
                      <td className="table-cell font-medium text-surface-800">{subject.subjectName}</td>
                      <td className="table-cell text-surface-500">{subject.units}</td>
                      <td className="table-cell text-surface-500 max-w-[260px] truncate">{subject.description || '—'}</td>
                      <td className="table-cell text-surface-500">{tutor ? `${tutor.tutorFirstName} ${tutor.tutorLastName}` : 'Unassigned'}</td>
                      <td className="table-cell text-surface-700 font-medium">{Number(subject.fee || 0).toFixed(2)}</td>
                      {isStudent && (() => {
                        if (passingSubjects.has(subject.subjectID)) {
                          return (
                            <td className="table-cell">
                              <span className="badge badge-green">Passed</span>
                            </td>
                          );
                        }
                        const enlistment = enlistmentBySubject.get(subject.subjectID);
                        if (enlistment) {
                          return (
                            <td className="table-cell">
                              <span className={`badge ${ENROLLMENT_STATUS_BADGES[enlistment.status] || 'badge-gray'}`}>
                                {enlistment.status}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td className="table-cell">
                            <input
                              type="checkbox"
                              checked={selectedSubjects.has(subject.subjectID)}
                              onChange={(e) => {
                                setSelectedSubjects((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(subject.subjectID);
                                  else next.delete(subject.subjectID);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 accent-brand-600 cursor-pointer"
                            />
                          </td>
                        );
                      })()}
                      {isAdmin && (
                        <td className="table-cell text-right">
                          <ActionButtons onEdit={() => openEdit(subject)} onDelete={() => setDeleteTarget(subject)} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Subject' : 'Add Subject'}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Subject Name *</label>
            <input
              className="input"
              value={form.subjectName}
              onChange={(e) => setForm((f) => ({ ...f, subjectName: e.target.value }))}
              placeholder="Mathematics"
            />
          </div>
          <div>
            <label className="label">Units *</label>
            <input
              type="number"
              min="1"
              step="1"
              className="input"
              value={form.units}
              onChange={(e) => setForm((f) => ({ ...f, units: e.target.value }))}
              placeholder="3"
            />
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea
              className="input min-h-[100px]"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description of the subject"
            />
          </div>
          <div>
            <label className="label">Tutor Assignment <span className="text-surface-400">(optional)</span></label>
            {tutors.length === 0 ? (
              <div className="input bg-surface-100 text-surface-500 flex items-center justify-between">
                <span>No tutors available right now</span>
                <span className="text-xs">You can assign one later</span>
              </div>
            ) : (
              <select
                className="input"
                value={form.tutorID}
                onChange={(e) => setForm((f) => ({ ...f, tutorID: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {tutors.map((t) => (
                  <option key={t.tutorID} value={t.tutorID}>
                    {t.tutorFirstName} {t.tutorLastName} ({t.specialization})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label">Fee *</label>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={form.fee}
              onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
              placeholder="100.00"
            />
            <p className="text-xs text-surface-400 mt-1">e.g. 1000 or 1500.50</p>
          </div>
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={
                !form.subjectName ||
                !form.units ||
                !form.fee ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              className="btn-primary"
            >
              {editing ? 'Update Subject' : 'Add Subject'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Subject"
        message={`Delete ${deleteTarget?.subjectName || 'this subject'}? This action cannot be undone.`}
        confirmLabel="Delete Subject"
        isProcessing={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.subjectID)}
      />

      {isStudent && selectedSubjects.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white rounded-full shadow-xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">
            {selectedSubjects.size} subject{selectedSubjects.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => enlistMutation.mutate([...selectedSubjects])}
            disabled={enlistMutation.isPending}
            className="flex items-center gap-2 bg-white text-brand-700 rounded-full px-4 py-1.5 text-sm font-semibold hover:bg-brand-50 transition-colors disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" />
            {enlistMutation.isPending ? 'Submitting…' : 'Submit Enlistment'}
          </button>
          <button
            onClick={() => setSelectedSubjects(new Set())}
            className="text-white/70 hover:text-white text-sm"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}