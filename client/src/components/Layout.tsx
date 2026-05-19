import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpen, Users, ClipboardList, CreditCard,
  FileText, BarChart3, LogOut, ChevronRight, GraduationCap,
  Menu
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, roles: ['admin', 'tutor', 'student', 'parent'] },
  { to: '/enrollment', label: 'Enrollment', icon: <ClipboardList className="w-4 h-4" />, roles: ['admin', 'student', 'parent'] },
  { to: '/payment', label: 'Payments', icon: <CreditCard className="w-4 h-4" />, roles: ['admin', 'student', 'parent'] },
  { to: '/records/students', label: 'Students', icon: <Users className="w-4 h-4" />, roles: ['admin', 'tutor'] },
  { to: '/records/subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" />, roles: ['admin', 'tutor', 'student', 'parent'] },
  { to: '/records/grades', label: 'Grades', icon: <GraduationCap className="w-4 h-4" />, roles: ['admin', 'tutor', 'student', 'parent'] },
  { to: '/records/attendance', label: 'Attendance', icon: <FileText className="w-4 h-4" />, roles: ['admin', 'tutor', 'student', 'parent'] },
];

const roleColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  tutor: 'bg-blue-100 text-blue-700',
  student: 'bg-emerald-100 text-emerald-700',
  parent: 'bg-amber-100 text-amber-700',
};

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
    navigate('/login');
  };

  const visibleNav = navItems.filter(item => user && item.roles.includes(user.role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-surface-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-display font-bold text-surface-900 leading-tight">ABC Learning</p>
            <p className="text-xs text-surface-500">Center</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`transition-colors ${isActive ? 'text-brand-600' : 'text-surface-400 group-hover:text-surface-600'}`}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 text-brand-400" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-surface-100">
        <div className="px-3 py-3 rounded-lg bg-surface-50 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-brand-700 text-sm font-semibold">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColors[user?.role || 'student']}`}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-surface-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-white border-r border-surface-200 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-surface-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-modal z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-surface-200">
          <button onClick={() => setSidebarOpen(true)} className="text-surface-600">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-semibold text-surface-900">ABC Learning Center</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
