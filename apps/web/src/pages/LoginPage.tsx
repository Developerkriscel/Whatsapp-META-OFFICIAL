/**
 * Login Page
 * Apple Design System
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      // Redirect superadmin to superadmin panel, others to dashboard
      if (user?.isSuperadmin) {
        navigate('/superadmin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [isAuthenticated, navigate, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      if (loggedUser?.isSuperadmin) {
        navigate('/superadmin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ios-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-wa-gradient rounded-apple-xl flex items-center justify-center mx-auto mb-4 shadow-wa">
            <svg viewBox="0 0 24 24" className="w-9 h-9 text-white" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.2-.436.463-.595.78-.159.317-.25.637-.25.92 0 .261.082.593.272.902.214.343.537.572.94.63.198.028.402-.003.583-.053.181-.05.29-.129.404-.177.114-.048.255-.107.536-.223l.813-.349c.197-.094.328-.197.416-.297a1.5 1.5 0 0 0 .157-.481c.013-.133.016-.28.016-.423h.002c.082-.635.298-1.476.613-2.412.319-.935.59-1.653.83-2.158.239-.504.478-.85.7-1.037.223-.187.447-.278.67-.278.22 0 .391.09.513.272.123.182.185.401.185.637 0 .509-.26 1.205-.756 2.063z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22.091c-5.564 0-10.091-4.527-10.091-10.091S6.436 1.909 12 1.909s10.091 4.527 10.091 10.091-4.527 10.091-10.091 10.091z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ios-dark">Welcome to WA Meta Auto</h1>
          <p className="text-ios-muted mt-2">Sign in to manage your WhatsApp Business</p>
        </div>

        {/* Login Form */}
        <div className="card-apple p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-ios-secondary mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ios-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-apple pl-10"
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-ios-secondary mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ios-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-apple pl-10 pr-10"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted hover:text-ios-dark transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-apple-red/10 text-apple-red text-sm rounded-apple-lg">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-apple btn-wa-green w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Forgot Password */}
          <div className="mt-4 text-center">
            <a href="#" className="text-sm text-wa-green hover:underline">Forgot password?</a>
          </div>
        </div>

        {/* Demo Credentials */}
        <div className="mt-6 p-4 bg-ios-gray/50 rounded-apple-lg text-sm">
          <p className="text-ios-muted font-medium mb-2">Demo Credentials:</p>
          <div className="space-y-1 text-ios-secondary">
            <p><strong>Admin:</strong> admin@demo.com / demo123</p>
            <p><strong>Superadmin:</strong> admin@whatsapp-saas.com / admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
