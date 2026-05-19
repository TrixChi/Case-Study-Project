export interface Student {
  studentID: number;
  stuFirstName: string;
  stuMiddleName?: string;
  stuLastName: string;
  stuContactInfo: string;
  address: string;
  status: string;
  parentID?: number;
  parent?: Parent;
}

export interface Parent {
  parentID: number;
  parentFirstName: string;
  parentMiddleName?: string;
  parentLastName: string;
  contactInfo: string;
  relationship: string;
}

export interface Tutor {
  tutorID: number;
  tutorFirstName: string;
  tutorLastName: string;
  specialization: string;
}

export interface AdminStaff {
  staffID: number;
  staffFirstName: string;
  staffLastName: string;
  role: string;
}

export interface Subject {
  subjectID: number;
  subjectName: string;
  units: number;
  description?: string;
  tutorID?: number;
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
}

export interface Grade {
  gradeID: number;
  gradeValue: number;
  academicStanding: string;
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
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
