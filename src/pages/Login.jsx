import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, ArrowRight, Lock, Eye, EyeOff } from 'lucide-react';

export const Login = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed. Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-100/70">
      <div className="w-full max-w-md space-y-6">
        {/* Logo & Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-block rounded-2xl bg-white p-3 shadow-md border border-slate-200">
            <img
              src="/sarthak-logo.jpg"
              alt="Sarthak TMT"
              className="h-16 w-auto mx-auto object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              SKA Ispat Sales Dashboard
            </h1>
            <p className="text-xs font-semibold text-[#a81b1e] mt-0.5 tracking-wide">
              Order to Dispatch System
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">Sign In to Your Account</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your authorized credentials to access the portal
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Username or Mobile Number
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Enter username or registered mobile"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:ring-1 focus:ring-[#a81b1e] focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:ring-1 focus:ring-[#a81b1e] focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-[#a81b1e] hover:bg-red-50 transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] py-2.5 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>


      </div>
    </div>
  );
};
