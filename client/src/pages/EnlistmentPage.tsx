import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, ClipboardList, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Enlistment, Subject } from '../types';
import { ENROLLMENT_STATUS_BADGES } from '../styles/design';
import toast from 'react-hot-toast';

export default function EnlistmentPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';

  const { data: enlistments = [], isLoading } = useQuery({
    queryKey: ['enlistment'],
    queryFn: async () => {
      const res = await api.get('/enlistment');
      return res.data.data as Enlistment[];
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/enlistment/${id}/status`, { status }),
    onSuccess: (_data, { status }) => {
      toast.success(`Enlistment ${status}`);
      qc.invalidateQueries({ queryKey: ['enlistment'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to update status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/enlistment/${id}`),
    onSuccess: () => {
      toast.success('Enlistment removed');
      qc.invalidateQueries({ queryKey: ['enlistment'] });
    },
    onError: () => toast.error('Failed to remove enlistment'),
  });

  const bySubject = useMemo(() => {
    const map = new Map<number, { subject: Subject; enlistments: Enlistment[] }>();
    for (const e of enlistments) {
      if (!e.subject) continue;
      if (!map.has(e.subjectID)) {
        map.set(e.subjectID, { subject: e.subject as Subject, enlistments: [] });
      }
      map.get(e.subjectID)!.enlistments.push(e);
    }
    return [...map.values()].sort((a, b) =>
      a.subject.subjectName.localeCompare(b.subject.subjectName)
    );
  }, [enlistments]);

  const pendingCount = enlistments.filter((e) => e.status === 'pending').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Enlistment</h1>
        <p className="text-sm text-surface-500 mt-1">
          {isAdmin
            ? `${enlistments.length} total enlistment${enlistments.length !== 1 ? 's' : ''}${pendingCount > 0 ? ` — ${pendingCount} pending` : ''}`
            : `${enlistments.length} submitted enlistment${enlistments.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && enlistments.length === 0 && (
        <div className="card p-10 text-center text-surface-400">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No enlistments found</p>
        </div>
      )}

      {/* Admin: grouped by subject */}
      {isAdmin && !isLoading && bySubject.map(({ subject, enlistments: rows }) => {
        const pending = rows.filter((r) => r.status === 'pending').length;
        return (
          <div key={subject.subjectID} className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="section-title">{subject.subjectName}</h2>
                <p className="text-xs text-surface-500 mt-0.5">
                  {subject.tutor
                    ? `${subject.tutor.tutorFirstName} ${subject.tutor.tutorLastName}`
                    : 'No tutor assigned'}{' '}
                  · {rows.length} student{rows.length !== 1 ? 's' : ''}
                  {pending > 0 && <span className="ml-2 badge badge-yellow">{pending} pending</span>}
                </p>
              </div>
            </div>
            <div className="divide-y divide-surface-50">
              {rows.map((e) => (
                <div key={e.enlistmentID} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900 text-sm">
                      {e.student
                        ? `${e.student.stuFirstName} ${e.student.stuLastName}`
                        : `Student #${e.studentID}`}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Submitted {new Date(e.enlistmentDate).toLocaleDateString()}
                      {e.validatedAt && ` · Reviewed ${new Date(e.validatedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`badge ${ENROLLMENT_STATUS_BADGES[e.status] || 'badge-gray'}`}>
                      {e.status}
                    </span>
                    {e.status === 'pending' && (
                      <>
                        <button
                          title="Approve"
                          onClick={() => statusMutation.mutate({ id: e.enlistmentID, status: 'approved' })}
                          disabled={statusMutation.isPending}
                          className="icon-btn text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          title="Reject"
                          onClick={() => statusMutation.mutate({ id: e.enlistmentID, status: 'rejected' })}
                          disabled={statusMutation.isPending}
                          className="icon-btn text-rose-600 hover:bg-rose-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {e.status === 'approved' && (
                      <button
                        title="Unapprove"
                        onClick={() => statusMutation.mutate({ id: e.enlistmentID, status: 'pending' })}
                        disabled={statusMutation.isPending}
                        className="icon-btn text-surface-400 hover:bg-surface-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      title="Remove"
                      onClick={() => deleteMutation.mutate(e.enlistmentID)}
                      disabled={deleteMutation.isPending}
                      className="icon-btn text-surface-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Student: own enlistments as a table */}
      {isStudent && !isLoading && enlistments.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header border-b border-surface-100">
                  <th className="table-cell text-left">Subject</th>
                  <th className="table-cell text-left">Tutor</th>
                  <th className="table-cell text-left">Date Submitted</th>
                  <th className="table-cell text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {enlistments.map((e) => (
                  <tr key={e.enlistmentID} className="table-row-hover">
                    <td className="table-cell font-medium">{e.subject?.subjectName || `Subject #${e.subjectID}`}</td>
                    <td className="table-cell text-surface-500">
                      {e.subject?.tutor
                        ? `${e.subject.tutor.tutorFirstName} ${e.subject.tutor.tutorLastName}`
                        : '—'}
                    </td>
                    <td className="table-cell text-surface-500">
                      {new Date(e.enlistmentDate).toLocaleDateString()}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${ENROLLMENT_STATUS_BADGES[e.status] || 'badge-gray'}`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
