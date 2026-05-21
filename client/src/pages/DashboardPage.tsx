import { useQuery } from '@tanstack/react-query';
import { Users, ClipboardList, CreditCard, GraduationCap, TrendingUp, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Enrollment, Payment, Grade, Attendance } from '../types';
import { useState, useEffect } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}

function StatCard({ title, value, icon, color, sub }: StatCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-display font-bold text-surface-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-surface-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: enrollments } = useQuery({
    queryKey: ['enrollment'],
    queryFn: async () => {
      const res = await api.get('/enrollment');
      return res.data.data as Enrollment[];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ['payment'],
    queryFn: async () => {
      const res = await api.get('/payment');
      return res.data.data as Payment[];
    },
    enabled: user?.role !== 'tutor',
  });

  const { data: parentDashboard } = useQuery({
    queryKey: ['parentDashboard'],
    queryFn: async () => {
      const res = await api.get('/records/parents/me/dashboard');
      return res.data.data as any;
    },
    enabled: user?.role === 'parent',
  });

  const { data: feeSummary } = useQuery({
    queryKey: ['feeSummary', user?.role],
    queryFn: async () => {
      const res = await api.get('/payment/summary');
      return res.data.data as any;
    },
    enabled: !!user,
  });

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role === 'parent' && parentDashboard?.students && parentDashboard.students.length > 0) {
      setSelectedStudentId(parentDashboard.students[0].studentID);
    }
  }, [user?.role, parentDashboard]);

  const { data: grades } = useQuery({
    queryKey: ['grades'],
    queryFn: async () => {
      const res = await api.get('/records/grades');
      return res.data.data as Grade[];
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ['attendance'],
    queryFn: async () => {
      const res = await api.get('/records/attendance');
      return res.data.data as Attendance[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const res = await api.get('/records/students');
      return res.data.data as { studentID: number }[];
    },
    enabled: user?.role === 'admin',
  });

  const filteredEnrollments = user?.role === 'parent' && selectedStudentId
    ? enrollments?.filter(e => e.studentID === selectedStudentId)
    : enrollments;

  const pendingEnrollments = filteredEnrollments?.filter(e => e.status === 'pending').length || 0;
  const approvedEnrollments = filteredEnrollments?.filter(e => e.status === 'approved').length || 0;

  const filteredGrades = user?.role === 'parent' && selectedStudentId
    ? grades?.filter(g => g.studentID === selectedStudentId)
    : grades;

  const summaryTotals = feeSummary?.totals || feeSummary;
  const totalPayments = summaryTotals?.totalPaid || payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const missingFees = summaryTotals?.missingFees || 0;

  const avgGrade = user?.role === 'parent'
    ? (() => {
        const p = parentDashboard?.students?.find((s: any) => s.studentID === selectedStudentId);
        return p ? String(p.avgGrade ?? '—') : '—';
      })()
    : filteredGrades && filteredGrades.length > 0
      ? (filteredGrades.reduce((sum, g) => sum + Number(g.gradeValue), 0) / filteredGrades.length).toFixed(1)
      : '—';

  const presentCount = user?.role === 'parent'
    ? (() => {
        const p = parentDashboard?.students?.find((s: any) => s.studentID === selectedStudentId);
        return p ? Math.round(((p.attendanceRate ?? 0) / 100) * (attendance?.filter(a => a.studentID === selectedStudentId).length || 0)) : 0;
      })()
    : attendance?.filter(a => a.status === 'present').length || 0;

  const totalAttendance = user?.role === 'parent'
    ? (attendance?.filter(a => a.studentID === selectedStudentId).length || 0)
    : attendance?.length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-surface-500 mt-1">
          Welcome back, <span className="font-medium text-surface-700">{user?.firstName} {user?.lastName}</span>
          <span className="ml-2 badge badge-blue">{user?.role}</span>
        </p>
      </div>

      {/* Parent: student selector */}
      {user?.role === 'parent' && parentDashboard?.students?.length > 1 && (
        <div className="card p-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-1">Viewing stats for</p>
            <select
              className="input"
              value={selectedStudentId ?? ''}
              onChange={(e) => setSelectedStudentId(Number(e.target.value))}
            >
              {(parentDashboard.students || []).map((s: any) => (
                <option key={s.studentID} value={s.studentID}>{s.stuFirstName} {s.stuLastName}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {user?.role === 'admin' && (
          <StatCard
            title="Total Students"
            value={students?.length || 0}
            icon={<Users className="w-5 h-5 text-blue-600" />}
            color="bg-blue-50"
          />
        )}
        {(user?.role === 'student' || user?.role === 'parent') && (
          <StatCard
            title="Enrollments"
            value={approvedEnrollments}
            icon={<ClipboardList className="w-5 h-5 text-emerald-600" />}
            color="bg-emerald-50"
            sub={pendingEnrollments > 0 ? `${pendingEnrollments} pending` : undefined}
          />
        )}
        {user?.role !== 'tutor' && (
          <StatCard
            title="Total Payments"
            value={`₱${totalPayments.toLocaleString()}`}
            icon={<CreditCard className="w-5 h-5 text-amber-600" />}
            color="bg-amber-50"
            sub={`${payments?.length || 0} transactions`}
          />
        )}
        {user?.role !== 'tutor' && (
          <StatCard
            title="Missing Fees"
            value={`₱${missingFees.toLocaleString()}`}
            icon={<AlertCircle className="w-5 h-5 text-rose-600" />}
            color="bg-rose-50"
            sub={feeSummary?.students ? `${feeSummary.students.length} student${feeSummary.students.length !== 1 ? 's' : ''}` : undefined}
          />
        )}
        {user?.role !== 'admin' && user?.role !== 'tutor' && (
          <StatCard
            title="Avg. Grade"
            value={avgGrade}
            icon={<GraduationCap className="w-5 h-5 text-purple-600" />}
            color="bg-purple-50"
            sub={`${filteredGrades?.length || 0} records`}
          />
        )}
        {user?.role !== 'tutor' && (
          <StatCard
            title="Attendance Rate"
            value={totalAttendance > 0 ? `${Math.round((presentCount / totalAttendance) * 100)}%` : '—'}
            icon={<TrendingUp className="w-5 h-5 text-rose-600" />}
            color="bg-rose-50"
            sub={`${presentCount} present / ${totalAttendance} total`}
          />
        )}
      </div>

      {/* Parent: per-student stats */}
      {user?.role === 'parent' && parentDashboard?.students?.length > 0 && (
        <div>
          <h3 className="section-title text-base mb-3">Per-Student Overview</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(parentDashboard.students as any[]).map((s) => (
              <div key={s.studentID} className="card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">{(s.stuFirstName?.[0] ?? '')}{(s.stuLastName?.[0] ?? '')}</span>
                  </div>
                  <p className="font-semibold text-surface-900">{s.stuFirstName} {s.stuLastName}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-surface-500 uppercase tracking-wide">Enrollments</p>
                    <p className="text-xl font-bold text-surface-900">{s.enrollmentCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-500 uppercase tracking-wide">Avg. Grade</p>
                    <p className="text-xl font-bold text-surface-900">{s.avgGrade != null ? s.avgGrade : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-500 uppercase tracking-wide">Attendance</p>
                    <p className="text-xl font-bold text-surface-900">{s.attendanceRate != null ? `${Math.round(s.attendanceRate)}%` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-500 uppercase tracking-wide">Balance</p>
                    <p className={`text-xl font-bold ${Number(s.balance) > 0 ? 'text-rose-600' : 'text-surface-900'}`}>₱{Number(s.balance).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {feeSummary && user?.role !== 'tutor' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100">
            <h3 className="section-title text-base">Fee breakdown</h3>
          </div>
          <div className="divide-y divide-surface-50">
            {(feeSummary.students || [feeSummary]).flatMap((student: any) => {
              const subjects = student.subjects || [];
              return subjects.length > 0
                ? [
                    <div key={student.studentID} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div>
                          <p className="text-sm font-medium text-surface-900">{student.stuFirstName} {student.stuLastName}</p>
                          <p className="text-xs text-surface-500">Missing fees: ₱{Number(student.missingFees || 0).toLocaleString()}</p>
                        </div>
                        <span className="badge badge-red">₱{Number(student.missingFees || 0).toLocaleString()}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {subjects.map((subject: any) => (
                          <div key={subject.subjectID} className="rounded-xl border border-surface-100 bg-surface-50 p-3">
                            <p className="text-sm font-medium text-surface-800">{subject.subjectName}</p>
                            <p className="text-xs text-surface-500 mt-1">Fee: ₱{Number(subject.fee || 0).toLocaleString()}</p>
                            <p className={`text-xs mt-1 ${Number(subject.balance || 0) > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              Balance: ₱{Number(subject.balance || 0).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ]
                : [];
            })}
          </div>
        </div>
      )}

      {/* Pending alerts for admin */}
      {user?.role === 'admin' && pendingEnrollments > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {pendingEnrollments} enrollment{pendingEnrollments > 1 ? 's' : ''} awaiting approval
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Review and approve or reject pending enrollment requests in the Enrollment module.
            </p>
          </div>
        </div>
      )}

      {/* Recent activity tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent enrollments — only for student and parent */}
        {(user?.role === 'student' || user?.role === 'parent') && <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100">
            <h3 className="section-title text-base">Recent Enrollments</h3>
          </div>
          <div className="divide-y divide-surface-50">
            {filteredEnrollments?.slice(0, 5).map((e) => (
              <div key={e.enrollmentID} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-surface-800">
                    {e.student?.stuFirstName} {e.student?.stuLastName}
                  </p>
                  <p className="text-xs text-surface-400">{e.subject?.subjectName}</p>
                </div>
                <span className={`badge ${
                  e.status === 'approved' ? 'badge-green' :
                  e.status === 'rejected' ? 'badge-red' : 'badge-yellow'
                }`}>{e.status}</span>
              </div>
            )) || (
              <p className="px-5 py-8 text-sm text-surface-400 text-center">No enrollment records</p>
            )}
          </div>
        </div>}

        {/* Recent grades */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100">
            <h3 className="section-title text-base">Recent Grades</h3>
          </div>
          <div className="divide-y divide-surface-50">
            {filteredGrades?.slice(0, 5).map((g) => (
              <div key={g.gradeID} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-surface-800">
                    {g.student?.stuFirstName} {g.student?.stuLastName}
                  </p>
                  <p className="text-xs text-surface-400">{g.subject?.subjectName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-surface-900">{g.gradeValue}</p>
                  <span className={`badge ${g.academicStanding === 'Passed' ? 'badge-green' : 'badge-red'}`}>
                    {g.academicStanding}
                  </span>
                </div>
              </div>
            )) || (
              <p className="px-5 py-8 text-sm text-surface-400 text-center">No grade records</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
