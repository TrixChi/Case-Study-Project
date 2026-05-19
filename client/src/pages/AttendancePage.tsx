import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, FileText } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Attendance, Student, Subject } from '../types';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { ATTENDANCE_STATUS_BADGES } from '../styles/design';
import toast from 'react-hot-toast';
import ActionButtons from '../components/ActionButtons';

const emptyForm = { studentID: '', subjectID: '', status: 'present', attendanceDate: new Date().toISOString().split('T')[0] };

export default function AttendancePage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const canEdit = user?.role === 'admin' || user?.role === 'tutor';
	const isAdmin = user?.role === 'admin';

	const [search, setSearch] = useState('');
	const [filterStatus, setFilterStatus] = useState('all');
	const [showModal, setShowModal] = useState(false);
	const [editing, setEditing] = useState<Attendance | null>(null);
	const [form, setForm] = useState(emptyForm);
		const [deleteTarget, setDeleteTarget] = useState<Attendance | null>(null);

	const { data: records = [], isLoading } = useQuery({
		queryKey: ['attendance'],
		queryFn: async () => { const res = await api.get('/records/attendance'); return res.data.data as Attendance[]; },
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
	const openEdit = (a: Attendance) => {
		setEditing(a);
		setForm({ studentID: String(a.studentID), subjectID: String(a.subjectID || ''), status: a.status, attendanceDate: a.attendanceDate.split('T')[0] });
		setShowModal(true);
	};

	const createMutation = useMutation({
		mutationFn: (data: typeof form) => api.post('/records/attendance', { ...data, studentID: Number(data.studentID), subjectID: data.subjectID ? Number(data.subjectID) : undefined }),
		onSuccess: () => { toast.success('Attendance recorded'); qc.invalidateQueries({ queryKey: ['attendance'] }); setShowModal(false); },
		onError: () => toast.error('Failed to record attendance'),
	});

	const updateMutation = useMutation({
		mutationFn: (data: typeof form) => api.patch(`/records/attendance/${editing?.attendanceID}`, { status: data.status, attendanceDate: data.attendanceDate }),
		onSuccess: () => { toast.success('Attendance updated'); qc.invalidateQueries({ queryKey: ['attendance'] }); setShowModal(false); },
		onError: () => toast.error('Failed to update'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/records/attendance/${id}`),
		 onSuccess: () => { toast.success('Record deleted'); qc.invalidateQueries({ queryKey: ['attendance'] }); setDeleteTarget(null); },
		onError: () => toast.error('Failed to delete'),
	});

	const filtered = records.filter(a => {
		const matchSearch = search === '' ||
			`${a.student?.stuFirstName} ${a.student?.stuLastName}`.toLowerCase().includes(search.toLowerCase());
		const matchStatus = filterStatus === 'all' || a.status === filterStatus;
		return matchSearch && matchStatus;
	});

	// Summary stats
	const present = records.filter(a => a.status === 'present').length;
	const absent = records.filter(a => a.status === 'absent').length;
	const late = records.filter(a => a.status === 'late').length;

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="page-title">Attendance</h1>
					<p className="text-sm text-surface-500 mt-1">{records.length} records total</p>
				</div>
				{canEdit && (
					<button onClick={openCreate} className="btn-primary">
						<Plus className="w-4 h-4" /> Mark Attendance
					</button>
				)}
			</div>

			{/* Summary pills */}
			<div className="flex gap-3 flex-wrap">
						<div className="stat-pill stat-pill--emerald">
							<div className="w-2 h-2 bg-emerald-500 rounded-full" />
							<span>{present} Present</span>
						</div>
						<div className="stat-pill stat-pill--amber">
							<div className="w-2 h-2 bg-amber-500 rounded-full" />
							<span>{late} Late</span>
						</div>
						<div className="stat-pill stat-pill--red">
							<div className="w-2 h-2 bg-red-500 rounded-full" />
							<span>{absent} Absent</span>
						</div>
			</div>

			<div className="flex flex-wrap gap-3">
				<div className="relative flex-1 min-w-[200px] max-w-xs">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
					<input type="text" placeholder="Search student…" value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" />
				</div>
				<select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input w-auto">
					<option value="all">All Status</option>
					<option value="present">Present</option>
					<option value="late">Late</option>
					<option value="absent">Absent</option>
				</select>
			</div>

			<div className="card overflow-hidden">
				{isLoading ? (
					<div className="flex items-center justify-center py-16">
						<div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
					</div>
				) : filtered.length === 0 ? (
					<div className="text-center py-16 text-surface-400">
						<FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
						<p className="text-sm">No attendance records found</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="table-header border-b border-surface-100">
									<th className="table-cell text-left">Student</th>
									<th className="table-cell text-left">Tutor</th>
									<th className="table-cell text-left">Date</th>
									<th className="table-cell text-left">Status</th>
									{canEdit && <th className="table-cell text-right">Actions</th>}
								</tr>
							</thead>
							<tbody className="divide-y divide-surface-50">
								{filtered.map((a) => (
									<tr key={a.attendanceID} className="table-row-hover">
										<td className="table-cell font-medium">{a.student?.stuFirstName} {a.student?.stuLastName}</td>
										<td className="table-cell text-surface-500">
											{a.tutor ? `${a.tutor.tutorFirstName} ${a.tutor.tutorLastName}` : '—'}
										</td>
										<td className="table-cell text-surface-500">
											{new Date(a.attendanceDate).toLocaleDateString()}
										</td>
										<td className="table-cell">
											<span className={`badge ${ATTENDANCE_STATUS_BADGES[a.status] || 'badge-gray'}`}>{a.status}</span>
										</td>
										{canEdit && (
											<td className="table-cell text-right">
												<ActionButtons onEdit={() => openEdit(a)} onDelete={isAdmin ? () => setDeleteTarget(a) : undefined} />
											</td>
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Attendance' : 'Mark Attendance'}>
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
								<label className="label">Subject</label>
								<select className="input" value={form.subjectID} onChange={e => setForm(f => ({ ...f, subjectID: e.target.value }))}>
									<option value="">Select subject…</option>
									{subjects.map(s => <option key={s.subjectID} value={s.subjectID}>{s.subjectName}</option>)}
								</select>
							</div>
						</>
					)}
					<div>
						<label className="label">Date *</label>
						<input type="date" className="input" value={form.attendanceDate} onChange={e => setForm(f => ({ ...f, attendanceDate: e.target.value }))} />
					</div>
					<div>
						<label className="label">Status *</label>
						<select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
							<option value="present">Present</option>
							<option value="late">Late</option>
							<option value="absent">Absent</option>
						</select>
					</div>
					<div className="flex justify-end gap-3 pt-2">
						<button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
						<button
							onClick={() => editing ? updateMutation.mutate(form) : createMutation.mutate(form)}
							disabled={!form.attendanceDate || (!editing && !form.studentID)}
							className="btn-primary"
						>
							{editing ? 'Update' : 'Mark Attendance'}
						</button>
					</div>
				</div>
			</Modal>

			<ConfirmModal
				isOpen={!!deleteTarget}
				title="Delete Attendance Record"
				message={`Delete the attendance record for ${deleteTarget?.student?.stuFirstName || 'this student'}? This action cannot be undone.`}
				confirmLabel="Delete Record"
				isProcessing={deleteMutation.isPending}
				onClose={() => setDeleteTarget(null)}
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.attendanceID)}
			/>
		</div>
	);
}

