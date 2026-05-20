import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, AlertCircle, KeyRound } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState('');
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      const { token, user } = res.data.data;
      login({
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName || user.first_name,
        lastName: user.lastName || user.last_name,
        profileId: user.profileId || user.profile_id,
      }, token);
      toast.success(`Welcome back, ${user.firstName || user.first_name}!`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetResult('');
    setResetLoading(true);

    try {
      const res = await api.post('/auth/forgot-password', { email: resetEmail.trim() });
      const temporaryPassword = res.data?.data?.temporaryPassword as string | undefined;
      setResetResult(
        temporaryPassword
          ? `Temporary password: ${temporaryPassword}`
          : 'Password reset successfully. Use the new temporary password to sign in.'
      );
      toast.success('Password reset completed');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Unable to reset password';
      setResetError(msg);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-700/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-300/10 backdrop-blur rounded-2xl mb-4 border border-brand-200/20">
            <BookOpen className="w-8 h-8 text-brand-300" />
          </div>
          <h1 className="text-3xl font-display font-bold text-brand-100">ABC Learning Center</h1>
          <p className="text-brand-300 mt-1 text-sm">School Management System</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-modal">
          <h2 className="text-xl font-display font-semibold text-brand-100 mb-6">Sign in to your account</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/30 text-red-200 rounded-lg px-3 py-2.5 mb-4 text-sm animate-slide-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-brand-200 mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3.5 py-2.5 bg-white/10 border border-white/20 rounded-lg text-brand-50 placeholder:text-brand-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-brand-200 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 pr-10 bg-white/10 border border-white/20 rounded-lg text-brand-50 placeholder:text-brand-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-300 hover:text-brand-100 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-login">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setResetEmail(email);
                setResetError('');
                setResetResult('');
                setResetOpen(true);
              }}
              className="w-full text-center text-xs font-medium text-brand-200 hover:text-brand-100 transition-colors"
            >
              Forgot password?
            </button>
          </form>
        </div>

        <p className="text-center text-brand-400 text-xs mt-6">
          ABC Learning Center © {new Date().getFullYear()} || Ferrer, Ang, Gentozala, Vicencio
        </p>
      </div>

      <Modal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset Password"
        size="sm"
      >
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <p className="text-sm text-surface-600 leading-6">
            Enter the account email address. A temporary password will be generated and stored for that account.
          </p>

          <div>
            <label className="label">Email address</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input pl-9"
              />
            </div>
          </div>

          {resetError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {resetError}
            </div>
          )}

          {resetResult && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 text-sm leading-6">
              {resetResult}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setResetOpen(false)} className="btn-secondary">
              Close
            </button>
            <button type="submit" disabled={resetLoading} className="btn-primary">
              {resetLoading ? 'Resetting…' : 'Reset Password'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
