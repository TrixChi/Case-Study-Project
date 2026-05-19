import { create } from 'zustand';

export type UserRole = 'admin' | 'tutor' | 'student' | 'parent';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  profileId: number;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const storedUser = localStorage.getItem('abc_user');
const storedToken = localStorage.getItem('abc_token');

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: storedToken || null,
  isAuthenticated: !!storedToken,

  login: (user, token) => {
    localStorage.setItem('abc_token', token);
    localStorage.setItem('abc_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('abc_token');
    localStorage.removeItem('abc_user');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
