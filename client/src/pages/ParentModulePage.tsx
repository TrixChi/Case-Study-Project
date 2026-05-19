import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Mail, Plus, Search, ShieldAlert, UserPlus } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Parent } from '../types';
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

const generateParentEmail = (firstName: string, lastName: string) => {
  return `${lastName.trim().toLowerCase()}.${firstName
    .trim()
    .toLowerCase()}.parent@abclearning.com`;
};

export default function ParentModulePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupParent, setLookupParent] = useState<Parent | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [requestLoading, setRequestLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

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

  const requestParentMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await api.post('/records/parents/me', payload);
      return res.data.data as Parent;
    },
    onSuccess: () => {
      toast.success('Parent request submitted');
      qc.invalidateQueries({ queryKey: ['parent-self'] });
      qc.invalidateQueries({ queryKey: ['parents'] });
      setLookupParent(null);
      setShowForm(false);
      setLookupEmail('');
      setForm(emptyForm);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to submit request');
    },
  });

  const validateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'approved' | 'rejected' }) => {
      const res = await api.patch(`/records/parents/${id}/validate`, { status });
      return res.data.data as Parent;
    },
    onSuccess: (_, variables) => {
      toast.success(`Relationship ${variables.status}`);
      qc.invalidateQueries({ queryKey: ['parents'] });
      qc.invalidateQueries({ queryKey: ['parent-self'] });
    },
    onError: () => toast.error('Failed to validate relationship'),
  });

  const lookupMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await api.get('/records/parents/lookup', { params: { email } });
      return res.data.data as Parent | null;
    },
    onSuccess: (parent) => {
      setLookupError('');
      setLookupParent(parent);
      setShowForm(true);
      if (parent) {
        setForm({
          email: parent.email || lookupEmail,
          password: '',
          parentFirstName: parent.parentFirstName || '',
          parentMiddleName: parent.parentMiddleName || '',
          parentLastName: parent.parentLastName || '',
          contactInfo: parent.contactInfo || '',
          relationship: parent.relationship || '',
        });
      } else {
        setForm((current) => ({ ...current, email: lookupEmail }));
      }
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      const message = error.response?.data?.error || 'Unable to look up parent';
      setLookupParent(null);
      setShowForm(true);
      setLookupError(message);
      setForm((current) => ({ ...current, email: lookupEmail }));
    },
  });

  const currentStatus = currentParent?.relationshipStatus || 'none';
  const canRequest = !currentParent || currentStatus === 'rejected';

  const pendingParents = useMemo(
    () => allParents.filter((parent) => parent.relationshipStatus === 'pending'),
    [allParents]
  );

  const submitRequest = async () => {
    if (!form.email || !form.relationship) {
      toast.error('Email and relationship are required');
      return;
    }

    if (!lookupParent && (!form.parentFirstName || !form.parentLastName || !form.contactInfo)) {
      toast.error('Fill out the new account details');
      return;
    }

    const confirmed = window.confirm(
  `Parent Account Details:

Email:
${form.email}

Default Password:
ABClearning2026

Proceed with parent request?`
);

if (!confirmed) return;

    setRequestLoading(true);
    try {
      await requestParentMutation.mutateAsync({...form,
    password: form.password?.trim() || 'ABClearning2026',
  });
    } finally {
      setRequestLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Parent / Guardian</h1>
          <p className="text-sm text-surface-500 mt-1">
            {isStudent && 'Add or link your parent account. Only your own request is shown here.'}
            {isAdmin && 'Review and approve parent-child relationship requests.'}
            {isParent && 'View your linked parent relationship.'}
          </p>
        </div>
        {isStudent && canRequest && (
          <button
            onClick={() => {
              setShowForm(true);
              setLookupParent(null);
              setLookupEmail('');
              setLookupError('');
              setForm(emptyForm);
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
              <p className="text-sm font-medium text-surface-500 uppercase tracking-wider">Current request</p>
              <h2 className="section-title mt-1">
                {currentParent.parentFirstName} {currentParent.parentLastName}
              </h2>
              <p className="text-sm text-surface-600 mt-1">{currentParent.contactInfo}</p>
            </div>
            <span className={`badge ${currentParent.relationshipStatus === 'approved' ? 'badge-green' : currentParent.relationshipStatus === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
              {currentParent.relationshipStatus || 'pending'}
            </span>
          </div>
          <p className="text-sm text-surface-600 mt-4">
            Relationship: <span className="font-medium text-surface-800">{currentParent.relationship}</span>
          </p>
          {currentParent.relationshipStatus === 'pending' && (
            <p className="text-sm text-amber-700 mt-3">
              Your parent request is waiting for admin validation.
            </p>
          )}
          {currentParent.relationshipStatus === 'approved' && (
            <p className="text-sm text-emerald-700 mt-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Your parent has been approved.
            </p>
          )}
        </div>
      )}

      {isStudent && canRequest && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-surface-500 uppercase tracking-wider">Find parent</p>
              <h2 className="section-title mt-1">Search by email</h2>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  type="email"
                  className="input pl-9"
                  placeholder="parent@example.com"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                />
              </div>
              <button
                onClick={() => lookupMutation.mutate(lookupEmail)}
                disabled={!lookupEmail || lookupMutation.isPending}
                className="btn-secondary"
              >
                <Search className="w-4 h-4" />
                {lookupMutation.isPending ? 'Searching…' : 'Find parent'}
              </button>
              {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
            </div>

            {lookupParent && (
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-surface-500">Existing account found</p>
                <p className="text-sm font-medium text-surface-900">
                  {lookupParent.parentFirstName} {lookupParent.parentLastName}
                </p>
                <p className="text-sm text-surface-600">{lookupParent.contactInfo}</p>
                <p className="text-sm text-surface-500">Relationship: {lookupParent.relationship}</p>
                <p className="text-xs text-surface-400">
                  Status: {lookupParent.relationshipStatus || 'pending'}
                </p>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-surface-500 uppercase tracking-wider">
                {lookupParent ? 'Request link' : 'Create new account'}
              </p>
              <h2 className="section-title mt-1">
                {lookupParent ? 'Use the existing parent account' : 'Make a new parent account'}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Email address *</label>
                <input
                    type="email"
                    className="input bg-surface-100 cursor-not-allowed"
                    value={form.email}
                    readOnly
                    placeholder="Auto-generated email"
                />
              </div>

              {!lookupParent && (
                <>
                  <div>
                    <label className="label">Password</label>

                    <input
                        type="password"
                        className="input bg-surface-100 cursor-not-allowed"
                        value="ABClearning2026"
                        readOnly
                        placeholder="Default password"
                    />
                </div>
                  <div>
                    <label className="label">First name *</label>
                    <input
                      className="input"
                      value={form.parentFirstName}
                      onChange={(e) =>
                        setForm((current) => {
                            const firstName = e.target.value;

                            return {
                                ...current,
                                parentFirstName: firstName,
                                email: generateParentEmail(firstName, current.parentLastName),
                            };
                        })
                    }
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="label">Middle name</label>
                    <input
                      className="input"
                      value={form.parentMiddleName}
                      onChange={(e) => setForm((current) => ({ ...current, parentMiddleName: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="label">Last name *</label>
                    <input
                      className="input"
                      value={form.parentLastName}
                      onChange={(e) =>
                        setForm((current) => {
                            const lastName = e.target.value;

                            return {
                            ...current,
                            parentLastName: lastName,
                            email: generateParentEmail(current.parentFirstName, lastName),
                            };
                        })
                    }
                      placeholder="Last name"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Contact info *</label>
                    <input
                      className="input"
                      value={form.contactInfo}
                      onChange={(e) => setForm((current) => ({ ...current, contactInfo: e.target.value }))}
                      placeholder="Phone number or address"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label className="label">Relationship *</label>
                <input
                  className="input"
                  value={form.relationship}
                  onChange={(e) => setForm((current) => ({ ...current, relationship: e.target.value }))}
                  placeholder="Mother, Father, Guardian"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setLookupParent(null);
                  setLookupError('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRequest}
                disabled={requestLoading}
                className="btn-primary"
              >
                <UserPlus className="w-4 h-4" />
                {requestLoading ? 'Submitting…' : lookupParent ? 'Request link' : 'Create account & request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100">
            <h2 className="section-title">Pending validation</h2>
          </div>
          {pendingParents.length === 0 ? (
            <div className="px-5 py-8 text-center text-surface-400 text-sm">
              No parent requests awaiting validation.
            </div>
          ) : (
            <div className="divide-y divide-surface-50">
              {pendingParents.map((parent) => (
                <div key={parent.parentID} className="px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-surface-900">
                      {parent.parentFirstName} {parent.parentLastName}
                    </p>
                    <p className="text-sm text-surface-600">{parent.contactInfo}</p>
                    <p className="text-sm text-surface-500">
                      Student ID: #{parent.studentID || '—'} · Relationship: {parent.relationship}
                    </p>
                    {parent.student && (
                      <p className="text-xs text-surface-400 mt-1">
                        Student: {parent.student.stuFirstName} {parent.student.stuLastName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => validateMutation.mutate({ id: parent.parentID, status: 'rejected' })}
                      disabled={validateMutation.isPending}
                      className="btn-secondary"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => validateMutation.mutate({ id: parent.parentID, status: 'approved' })}
                      disabled={validateMutation.isPending}
                      className="btn-primary"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
