export interface AdminAccount {
  staffFirstName?: string;
  staffLastName?: string;
    email: string;
  password: string;
  role?: string;
}

export const adminAccounts: AdminAccount[] = [
  { staffFirstName: 'John', staffLastName: 'Doe', email: 'admin1@example.com', password: 'password123', role: 'superadmin' },
  { staffFirstName: 'Jane', staffLastName: 'Smith', email: 'admin2@example.com', password: 'securePass!@#', role: 'admin' },
];

export default adminAccounts;
