import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Trash2, Search, Filter, BookOpen, User, Calendar, Hash, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Enrollment, Student, Subject } from '../types';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { ENROLLMENT_STATUS_BADGES } from '../styles/design';
import toast from 'react-hot-toast';

function SubjectCard({ enrollment: e }: { enrollment: Enrollment }) {
	const tutor = e.subject?.tutor as { tutorFirstName: string; tutorLastName: string } | undefined;
	return (
		<div className="card p-4 flex flex-col gap-3">
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
						<BookOpen className="w-4 h-4 text-brand-500" />
					</div>
					<h3 className="font-semibold text-surface-800 truncate">{e.subject?.subjectName}</h3>
				</div>
				<span className={`badge shrink-0 ${ENROLLMENT_STATUS_BADGES[e.status] || 'badge-gray'}`}>{e.status}</span>
			</div>
			{e.subject?.description && (
				<p className="text-xs text-surface-500 line-clamp-2">{e.subject.description}</p>
			)}
			<div className="grid grid-cols-2 gap-2 text-xs text-surface-500">
				<div className="flex items-center gap-1.5">
					<Hash className="w-3.5 h-3.5 shrink-0" />
					<span>{e.subject?.units ?? '—'} units</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="font-medium text-surface-700">₱{Number(e.subject?.fee || 0).toLocaleString()}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<User className="w-3.5 h-3.5 shrink-0" />
					<span className="truncate">{tutor ? `${tutor.tutorFirstName} ${tutor.tutorLastName}` : 'No tutor assigned'}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<Calendar className="w-3.5 h-3.5 shrink-0" />
					<span>{new Date(e.enrollmentDate).toLocaleDateString()}</span>
				</div>
			</div>
		</div>
	);
}

export default function EnrollmentPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isAdmin = user?.role === 'admin';
	const isStudent = user?.role === 'student';
	const isParent = user?.role === 'parent';

	const [search, setSearch] = useState('');
	const [filterStatus, setFilterStatus] = useState('all');
	const [showModal, setShowModal] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
	const [form, setForm] = useState({ studentID: '', subjectIDs: [] as number[] });

	const { data: enrollments = [], isLoading } = useQuery({
		queryKey: ['enrollment'],
		queryFn: async () => {
			const res = await api.get('/enrollment');
			return res.data.data as Enrollment[];
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

	const { data: subjects = [] } = useQuery({
		queryKey: ['subjects'],
		queryFn: async () => {
			const res = await api.get('/records/subjects');
			return res.data.data as Subject[];
		},
		enabled: isAdmin,
	});

	const { data: paymentSummary } = useQuery({
		queryKey: ['paymentSummary'],
		queryFn: async () => {
			const res = await api.get('/payment/summary');
			return res.data.data as {
				missingFees: number;
				totalFees: number;
				totalPaid: number;
				totals?: { missingFees: number; totalFees: number; totalPaid: number };
			};
		},
		enabled: isStudent || isParent,
	});

	const selectedSubjectCount = form.subjectIDs.length;
	const selectedSubjectTotalUnits = subjects
		.filter(subject => form.subjectIDs.includes(subject.subjectID))
		.reduce((sum, subject) => sum + Number(subject.units || 0), 0);
	const selectedSubjectTotalFee = subjects
		.filter(subject => form.subjectIDs.includes(subject.subjectID))
		.reduce((sum, subject) => sum + Number(subject.fee || 0), 0);

	const createMutation = useMutation({
		mutationFn: (data: typeof form) => api.post('/enrollment', { studentID: Number(data.studentID), subjectIDs: data.subjectIDs }),
		onSuccess: () => {
			toast.success('Enrollment created');
			qc.invalidateQueries({ queryKey: ['enrollment'] });
			setShowModal(false);
			setForm({ studentID: '', subjectIDs: [] });
		},
		onError: (err: { response?: { data?: { error?: string } } }) => {
			toast.error(err.response?.data?.error || 'Failed to create enrollment');
		},
	});

	const statusMutation = useMutation({
		mutationFn: ({ id, status }: { id: number; status: string }) =>
			api.patch(`/enrollment/${id}/status`, { status }),
		onSuccess: (_, vars) => {
			toast.success(`Enrollment ${vars.status}`);
			qc.invalidateQueries({ queryKey: ['enrollment'] });
		},
		onError: () => toast.error('Failed to update status'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/enrollment/${id}`),
		onSuccess: () => {
			toast.success('Enrollment deleted');
			qc.invalidateQueries({ queryKey: ['enrollment'] });
			setDeleteTarget(null);
		},
		onError: () => toast.error('Failed to delete enrollment'),
	});

	const filtered = enrollments.filter(e => {
		const matchSearch = search === '' ||
			`${e.student?.stuFirstName} ${e.student?.stuLastName}`.toLowerCase().includes(search.toLowerCase()) ||
			e.subject?.subjectName?.toLowerCase().includes(search.toLowerCase());
		const matchStatus = filterStatus === 'all' || e.status === filterStatus;
		return matchSearch && matchStatus;
	});

	if (isStudent) {
		const approved = enrollments.filter(e => e.status === 'approved');
		const pending = enrollments.filter(e => e.status === 'pending');
		const rejected = enrollments.filter(e => e.status === 'rejected');
		const totalUnits = approved.reduce((sum, e) => sum + Number(e.subject?.units || 0), 0);
		const totalFee = approved.reduce((sum, e) => sum + Number(e.subject?.fee || 0), 0);
		const missingFees = paymentSummary?.missingFees ?? 0;

		return (
			<div className="space-y-6 animate-fade-in">
				<div>
					<h1 className="page-title">My Enrolled Subjects</h1>
					<p className="text-sm text-surface-500 mt-1">
						{approved.length} active subject{approved.length !== 1 ? 's' : ''} · {totalUnits} units · ₱{totalFee.toLocaleString()}
					</p>
				</div>

				{missingFees > 0 && (
					<div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
						<AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
						<div>
							<p className="font-semibold text-amber-800">Outstanding Balance</p>
							<p className="text-sm text-amber-700 mt-0.5">
								You have an outstanding balance of <span className="font-semibold">₱{missingFees.toLocaleString()}</span>. Please coordinate with the admin to settle your fees.
							</p>
						</div>
					</div>
				)}

				{isLoading ? (
					<div className="flex items-center justify-center py-16">
						<div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
					</div>
				) : enrollments.length === 0 ? (
					<div className="card text-center py-16 text-surface-400">
						<BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
						<p className="text-sm">You are not enrolled in any subjects yet.</p>
					</div>
				) : (
					<div className="space-y-6">
						{approved.length > 0 && (
							<div className="space-y-3">
								<h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Active</h2>
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{approved.map(e => <SubjectCard key={e.enrollmentID} enrollment={e} />)}
								</div>
							</div>
						)}
						{pending.length > 0 && (
							<div className="space-y-3">
								<h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Pending Approval</h2>
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{pending.map(e => <SubjectCard key={e.enrollmentID} enrollment={e} />)}
								</div>
							</div>
						)}
						{rejected.length > 0 && (
							<div className="space-y-3">
								<h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Rejected</h2>
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{rejected.map(e => <SubjectCard key={e.enrollmentID} enrollment={e} />)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		);
	}

	if (isParent) {
		const missingFees = paymentSummary?.totals?.missingFees ?? paymentSummary?.missingFees ?? 0;
		return (
			<div className="space-y-6 animate-fade-in">
				<div>
					<h1 className="page-title">Enrollment</h1>
					<p className="text-sm text-surface-500 mt-1">{enrollments.length} enrollment records for your student(s)</p>
				</div>

				{missingFees > 0 && (
					<div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
						<AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
						<div>
							<p className="font-semibold text-amber-800">Outstanding Balance</p>
							<p className="text-sm text-amber-700 mt-0.5">
								Total outstanding balance: <span className="font-semibold">₱{missingFees.toLocaleString()}</span>. Please coordinate with the admin to settle fees.
							</p>
						</div>
					</div>
				)}

				<div className="card overflow-hidden">
					{isLoading ? (
						<div className="flex items-center justify-center py-16">
							<div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
						</div>
					) : enrollments.length === 0 ? (
						<div className="text-center py-16 text-surface-400">
							<p className="text-sm">No enrollment records found</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="table-header border-b border-surface-100">
										<th className="table-cell text-left">Student</th>
										<th className="table-cell text-left">Subject</th>
										<th className="table-cell text-left">Tutor</th>
										<th className="table-cell text-left">Date</th>
										<th className="table-cell text-left">Status</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-surface-50">
									{enrollments.map((e) => (
										<tr key={e.enrollmentID} className="table-row-hover">
											<td className="table-cell font-medium">{e.student?.stuFirstName} {e.student?.stuLastName}</td>
											<td className="table-cell">{e.subject?.subjectName}</td>
											<td className="table-cell text-surface-500">
												{e.subject?.tutor
													? `${(e.subject.tutor as { tutorFirstName: string; tutorLastName: string }).tutorFirstName} ${(e.subject.tutor as { tutorFirstName: string; tutorLastName: string }).tutorLastName}`
													: '—'}
											</td>
											<td className="table-cell text-surface-500">{new Date(e.enrollmentDate).toLocaleDateString()}</td>
											<td className="table-cell">
												<span className={`badge ${ENROLLMENT_STATUS_BADGES[e.status] || 'badge-gray'}`}>{e.status}</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="page-title">Enrollment</h1>
					<p className="text-sm text-surface-500 mt-1">{enrollments.length} total records</p>
				</div>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap gap-3">
				<div className="relative flex-1 min-w-[200px] max-w-xs">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
					<input
						type="text"
						placeholder="Search student or subject…"
						value={search}
						onChange={e => setSearch(e.target.value)}
						className="input pl-9"
					/>
				</div>
				<div className="flex items-center gap-2">
					<Filter className="w-4 h-4 text-surface-400" />
					<select
						value={filterStatus}
						onChange={e => setFilterStatus(e.target.value)}
						className="input w-auto"
					>
						<option value="all">All Status</option>
						<option value="pending">Pending</option>
						<option value="approved">Approved</option>
						<option value="rejected">Rejected</option>
					</select>
				</div>
			</div>

			{/* Table */}
			<div className="card overflow-hidden">
				{isLoading ? (
					<div className="flex items-center justify-center py-16">
						<div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
					</div>
				) : filtered.length === 0 ? (
					<div className="text-center py-16 text-surface-400">
						<p className="text-sm">No enrollment records found</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="table-header border-b border-surface-100">
									<th className="table-cell text-left">ID</th>
									<th className="table-cell text-left">Student</th>
									<th className="table-cell text-left">Subject</th>
									<th className="table-cell text-left">Tutor</th>
									<th className="table-cell text-left">Date</th>
									<th className="table-cell text-left">Status</th>
									{isAdmin && <th className="table-cell text-right">Actions</th>}
								</tr>
							</thead>
							<tbody className="divide-y divide-surface-50">
								{filtered.map((e) => (
									<tr key={e.enrollmentID} className="table-row-hover">
										<td className="table-cell font-mono text-xs text-surface-400">#{e.enrollmentID}</td>
										<td className="table-cell font-medium">
											{e.student?.stuFirstName} {e.student?.stuLastName}
										</td>
										<td className="table-cell">{e.subject?.subjectName}</td>
										<td className="table-cell text-surface-500">
											{e.subject?.tutor
												? `${(e.subject.tutor as { tutorFirstName: string; tutorLastName: string }).tutorFirstName} ${(e.subject.tutor as { tutorFirstName: string; tutorLastName: string }).tutorLastName}`
												: '—'}
										</td>
										<td className="table-cell text-surface-500">
											{new Date(e.enrollmentDate).toLocaleDateString()}
										</td>
										<td className="table-cell">
											<span className={`badge ${ENROLLMENT_STATUS_BADGES[e.status] || 'badge-gray'}`}>{e.status}</span>
										</td>
										{isAdmin && (
											<td className="table-cell text-right">
												<div className="flex items-center justify-end gap-1.5">
													{e.status === 'pending' && (
														<>
															<button
																onClick={() => statusMutation.mutate({ id: e.enrollmentID, status: 'approved' })}
																className="icon-btn icon-btn--success"
																title="Approve"
															>
																<Check className="w-4 h-4" />
															</button>
															<button
																onClick={() => statusMutation.mutate({ id: e.enrollmentID, status: 'rejected' })}
																className="icon-btn icon-btn--danger"
																title="Reject"
															>
																<X className="w-4 h-4" />
															</button>
														</>
													)}
													<button
														onClick={() => setDeleteTarget(e)}
														className="icon-btn icon-btn--danger"
														title="Delete"
													>
														<Trash2 className="w-4 h-4" />
													</button>
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

			{/* Create Modal */}
			<Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Enrollment">
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
						<div className="flex items-center justify-between gap-3">
							<label className="label mb-0">Subjects *</label>
							<p className="text-xs text-surface-500">
								{selectedSubjectCount} selected · {selectedSubjectTotalUnits} units · ₱{selectedSubjectTotalFee.toLocaleString()}
							</p>
						</div>
						<div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto rounded-xl border border-surface-200 p-3 bg-surface-50">
							{subjects.map(subject => {
								const checked = form.subjectIDs.includes(subject.subjectID);
								return (
									<label key={subject.subjectID} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? 'border-brand-400 bg-brand-50' : 'border-surface-200 bg-white hover:border-surface-300'}`}>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => {
												setForm(f => ({
													...f,
													subjectIDs: checked
														? f.subjectIDs.filter(id => id !== subject.subjectID)
														: [...f.subjectIDs, subject.subjectID],
												}));
											}}
											className="mt-1"
										/>
										<div>
											<p className="font-medium text-surface-800">{subject.subjectName}</p>
											<p className="text-xs text-surface-500">{subject.units} units · ₱{Number(subject.fee || 0).toLocaleString()}</p>
											<p className="text-xs text-surface-400 mt-0.5">
												{subject.tutor
													? `${(subject.tutor as { tutorFirstName: string; tutorLastName: string }).tutorFirstName} ${(subject.tutor as { tutorFirstName: string; tutorLastName: string }).tutorLastName}`
													: 'No tutor assigned'}
											</p>
										</div>
									</label>
								);
							})}
						</div>
					</div>
					<div className="flex justify-end gap-3 pt-2">
						<button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
						<button
							onClick={() => createMutation.mutate(form)}
							disabled={!form.studentID || form.subjectIDs.length === 0 || createMutation.isPending}
							className="btn-primary"
						>
							{createMutation.isPending ? 'Creating…' : 'Create Enrollment'}
						</button>
					</div>
				</div>
			</Modal>

			<ConfirmModal
				isOpen={!!deleteTarget}
				title="Delete Enrollment"
				message={`Delete enrollment #${deleteTarget?.enrollmentID || ''}? This action cannot be undone.`}
				confirmLabel="Delete Enrollment"
				isProcessing={deleteMutation.isPending}
				onClose={() => setDeleteTarget(null)}
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.enrollmentID)}
			/>
		</div>
	);
}

