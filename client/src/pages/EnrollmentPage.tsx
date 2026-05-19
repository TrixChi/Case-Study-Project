import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Trash2, Search, Filter } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Enrollment, Student, Subject } from '../types';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { ENROLLMENT_STATUS_BADGES } from '../styles/design';
import toast from 'react-hot-toast';

export default function EnrollmentPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isAdmin = user?.role === 'admin';

	const [search, setSearch] = useState('');
	const [filterStatus, setFilterStatus] = useState('all');
	const [showModal, setShowModal] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
	const [form, setForm] = useState({ studentID: '', subjectID: '' });

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

	const createMutation = useMutation({
		mutationFn: (data: typeof form) => api.post('/enrollment', { studentID: Number(data.studentID), subjectID: Number(data.subjectID) }),
		onSuccess: () => {
			toast.success('Enrollment created');
			qc.invalidateQueries({ queryKey: ['enrollment'] });
			setShowModal(false);
			setForm({ studentID: '', subjectID: '' });
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

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="page-title">Enrollment</h1>
					<p className="text-sm text-surface-500 mt-1">{enrollments.length} total records</p>
				</div>
				{isAdmin && (
					<button onClick={() => setShowModal(true)} className="btn-primary">
						<Plus className="w-4 h-4" /> New Enrollment
					</button>
				)}
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
						<label className="label">Subject *</label>
						<select
							value={form.subjectID}
							onChange={e => setForm(f => ({ ...f, subjectID: e.target.value }))}
							className="input"
						>
							<option value="">Select subject…</option>
							{subjects.map(s => (
								<option key={s.subjectID} value={s.subjectID}>
									{s.subjectName} ({s.units} units)
								</option>
							))}
						</select>
					</div>
					<div className="flex justify-end gap-3 pt-2">
						<button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
						<button
							onClick={() => createMutation.mutate(form)}
							disabled={!form.studentID || !form.subjectID || createMutation.isPending}
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

