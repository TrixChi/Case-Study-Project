import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, UserPlus } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Parent, Student } from '../types';
import toast from 'react-hot-toast';

const emptyForm = {
  email: '',
  password: '',
  parentFirstName: '',
  parentMiddleName: '',
  parentLastName: '',
  contactInfo: '',
  relationship: '',
};

const DEFAULT_PASSWORD = 'ABClearning2026';
const RELATIONSHIP_OPTIONS = ['guardian', 'mother', 'father'] as const;

const generateParentEmail = (firstName: string, lastName: string) => {
  return `${lastName.trim().toLowerCase()}.${firstName
    .trim()
    .toLowerCase()}.parent@abclearning.com`;
};

const getApprovalState = (parent?: Parent | null) => {
  if (!parent) return 'pending';
  return parent.approved || 'pending';
};

export default function ParentModulePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';

  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminForm, setAdminForm] = useState({ ...emptyForm, studentID: '' });

  const resetAdminForm = () => setAdminForm({ ...emptyForm, studentID: '' });

  const { data: currentParent } = useQuery({
    queryKey: ['parent-self'],
    queryFn: async () => {
      const res = await api.get('/records/parents/me');
      return res.data.data as Parent | null;
    },
    enabled: isStudent || isParent,
  });

  const { data: allParents = [] } = useQuery({
    queryKey: ['parents'],
    queryFn: async () => {
      const res = await api.get('/records/parents');
      return res.data.data as Parent[];
    },
    enabled: isAdmin,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const res = await api.get('/records/students');
      return res.data.data as Student[];
    },
    enabled: isAdmin,
  });

  const adminCreateMutation = useMutation({
    mutationFn: async (payload: typeof adminForm) => {
      const res = await api.post('/records/parents', {
        ...payload,
        studentID: payload.studentID ? Number(payload.studentID) : undefined,
      });
      return res.data.data as Parent;
    },
    onSuccess: () => {
      toast.success('Parent request submitted');
      qc.invalidateQueries({ queryKey: ['parents'] });
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.refetchQueries({ queryKey: ['parents'] });
      setShowAdminForm(false);
      resetAdminForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create parent account');
    },
  });

  const parentList = allParents;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Parent / Guardian</h1>
          <p className="text-sm text-surface-500 mt-1">
            {isStudent && 'View your linked parent account.'}
            {isAdmin && 'Manage parent accounts and view the parent list.'}
            {isParent && 'View your linked parent profile.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setShowAdminForm(true);
              resetAdminForm();
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Add Parent
          </button>
        )}
      </div>

      {isStudent && currentParent && (
        <div className="card p-5 border border-surface-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-surface-500 uppercase tracking-wider">Parent profile</p>
              <h2 className="section-title mt-1">
                {currentParent.parentFirstName} {currentParent.parentLastName}
              </h2>
              <p className="text-sm text-surface-600 mt-1">{currentParent.contactInfo}</p>
            </div>
            <span className={`badge ${getApprovalState(currentParent) === 'approved' ? 'badge-green' : getApprovalState(currentParent) === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
              {getApprovalState(currentParent)}
            </span>
          </div>
          <p className="text-sm text-surface-600 mt-4">
            Relationship: <span className="font-medium text-surface-800">{currentParent.relationshipStatus || currentParent.relationship}</span>
          </p>
          {getApprovalState(currentParent) === 'approved' && (
            <p className="text-sm text-emerald-700 mt-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Parent profile linked.
            </p>
          )}
        </div>
      )}

      {isStudent && !currentParent && (
        <div className="card p-5 text-center text-surface-600">
          <p className="text-sm">No parent account is linked to your profile. Please contact the admin to link a parent account.</p>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100">
              <h2 className="section-title">All parents</h2>
            </div>
            {parentList.length === 0 ? (
              <div className="px-5 py-8 text-center text-surface-400 text-sm">
                No parent records found.
              </div>
            ) : (
              <div className="divide-y divide-surface-50">
                {parentList.map((parent) => (
                  <div key={parent.parentID} className="px-5 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-surface-900">
                        {parent.parentFirstName} {parent.parentLastName}
                      </p>
                      <p className="text-sm text-surface-600">{parent.contactInfo}</p>
                      <p className="text-sm text-surface-500">
                        Relationship: {parent.relationshipStatus || parent.relationship}
                        {' '}· Student ID: #{parent.studentID || '—'}
                      </p>
                    </div>
                    <span className="badge badge-green">{getApprovalState(parent)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAdminForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-surface-900/50 backdrop-blur-sm" onClick={() => setShowAdminForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-2xl animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <h2 className="section-title">Add Parent</h2>
              <button onClick={() => setShowAdminForm(false)} className="icon-btn icon-btn--muted">
                ×
              </button>
            </div>
            <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Email address *</label>
                <input
                  type="email"
                  className="input bg-surface-100 cursor-not-allowed"
                  value={adminForm.email}
                  readOnly
                  placeholder="Auto-generated email"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input bg-surface-100 cursor-not-allowed"
                  value={DEFAULT_PASSWORD}
                  readOnly
                  placeholder="Default password"
                />
              </div>
              <div>
                <label className="label">Student</label>
                <select
                  className="input"
                  value={adminForm.studentID}
                  onChange={(e) => setAdminForm((current) => ({ ...current, studentID: e.target.value }))}
                >
                  <option value="">No student link</option>
                  {students.map((student) => (
                    <option key={student.studentID} value={student.studentID}>
                      {student.stuFirstName} {student.stuLastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">First name *</label>
                <input
                  className="input"
                  value={adminForm.parentFirstName}
                  onChange={(e) => {
                    const firstName = e.target.value;
                    setAdminForm((current) => ({
                      ...current,
                      parentFirstName: firstName,
                      email: generateParentEmail(firstName, current.parentLastName),
                    }));
                  }}
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="label">Middle name</label>
                <input
                  className="input"
                  value={adminForm.parentMiddleName}
                  onChange={(e) => setAdminForm((current) => ({ ...current, parentMiddleName: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="label">Last name *</label>
                <input
                  className="input"
                  value={adminForm.parentLastName}
                  onChange={(e) => {
                    const lastName = e.target.value;
                    setAdminForm((current) => ({
                      ...current,
                      parentLastName: lastName,
                      email: generateParentEmail(current.parentFirstName, lastName),
                    }));
                  }}
                  placeholder="Last name"
                />
              </div>
              <div>
                <label className="label">Contact info *</label>
                <input
                  className="input"
                  value={adminForm.contactInfo}
                  onChange={(e) => setAdminForm((current) => ({ ...current, contactInfo: e.target.value }))}
                  placeholder="Phone number or address"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Relationship *</label>
                <select
                  className="input"
                  value={adminForm.relationship}
                  onChange={(e) => setAdminForm((current) => ({ ...current, relationship: e.target.value }))}
                >
                  <option value="">Select relationship</option>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAdminForm(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => adminCreateMutation.mutate(adminForm)}
                  disabled={
                    !adminForm.email ||
                    !adminForm.parentFirstName ||
                    !adminForm.parentLastName ||
                    !adminForm.contactInfo ||
                    !adminForm.relationship ||
                    adminCreateMutation.isPending
                  }
                  className="btn-primary"
                >
                  <UserPlus className="w-4 h-4" />
                  {adminCreateMutation.isPending ? 'Creating…' : 'Create Parent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isAdmin && !isStudent && !isParent && (
        <div className="card p-5 text-sm text-surface-600">
          This module is not available for your role.
        </div>
      )}

    </div>
  );
}
