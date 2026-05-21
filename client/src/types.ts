export type UserRole = 'admin' | 'tutor' | 'student' | 'parent';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface Student {
  studentID: number;
  stuFirstName: string;
  stuMiddleName?: string;
  stuLastName: string;
  stuContactInfo: string;
  address: string;
  status: 'enrolled' | 'graduate' | 'unpaid' | 'missing fees';
  parentID?: number;
  userId?: string;
  email?: string;
  overdueFees?: number;
  parent?: Parent;
}

export interface Parent {
  parentID: number;
  email?: string;
  parentFirstName: string;
  parentMiddleName?: string;
  parentLastName: string;
  contactInfo: string;
  relationship?: string;
  relationshipStatus?: 'guardian' | 'mother' | 'father';
  approved?: 'pending' | 'approved' | 'rejected' | null;
  studentID?: number;
  validatedBy?: number;
  validatedAt?: string;
  student?: Student;
  userId?: string;
}

export interface Tutor {
  tutorID: number;
  tutorFirstName: string;
  tutorLastName: string;
  specialization: string;
  status: 'active' | 'on leave' | 'dismissed';
  userId?: string;
  email?: string;
}

export interface AdminStaff {
  staffID: number;
  staffFirstName: string;
  staffLastName: string;
  role: string;
  userId?: string;
}

export interface Subject {
  subjectID: number;
  subjectName: string;
  units: number;
  description?: string;
  tutorID?: number;
  fee: number;
  tutor?: Tutor;
}

export interface Enrollment {
  enrollmentID: number;
  enrollmentDate: string;
  status: 'pending' | 'approved' | 'rejected';
  studentID: number;
  subjectID: number;
  validatedBy?: number;
  student?: Student;
  subject?: Subject;
  validator?: AdminStaff;
}

export interface Attendance {
  attendanceID: number;
  attendanceDate: string;
  status: 'present' | 'absent' | 'late';
  studentID: number;
  subjectID?: number;
  tutorID?: number;
  student?: Student;
  tutor?: Tutor;
  subject?: { subjectName: string };
}

export interface Grade {
  gradeID: number;
  gradeValue: number;
  academicStanding: string;
  released?: boolean;
  studentID: number;
  subjectID: number;
  tutorID: number;
  student?: Student;
  subject?: Subject;
  tutor?: Tutor;
}

export interface Payment {
  paymentID: number;
  amount: number;
  paymentDate: string;
  receiptNo: string;
  balance: number;
  studentID: number;
  student?: Student;
  subject?: Subject;
}

export interface Transcript {
  transcriptID: number;
  dateGenerated: string;
  studentID: number;
  validatedBy?: number;
  student?: Student;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  profileId: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
