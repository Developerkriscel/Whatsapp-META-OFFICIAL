/**
 * Forgot Password Page — KriscelWA
 * Matches the login page's design language.
 */

import { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Mail, CheckCircle2 } from 'lucide-react';
import KriscelWaBrandmark from '../components/KriscelWaBrandmark';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emailId = useId();
  const emailErrorId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch {
      // Backend already avoids email enumeration by always succeeding;
      // this only fires on real network/server failure.
      setError('We couldn\'t send that right now. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F3F0] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[400px] bg-white rounded-[28px] border border-black/[0.06] shadow-[0_2px_24px_rgba(0,0,0,0.04)] px-8 py-10 sm:px-10">
        <Link to="/login" className="flex justify-center mb-10 w-fit mx-auto">
          <KriscelWaBrandmark compact />
        </Link>

        {submitted ? (
          <div className="text-center py-2">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#EAF6E3' }}>
              <CheckCircle2 className="w-7 h-7" style={{ color: '#14532D' }} />
            </div>
            <h1 className="text-xl font-bold text-ios-dark">Check your email</h1>
            <p className="mt-2 text-[14px] text-ios-secondary leading-relaxed">
              If an account exists for <span className="font-medium text-ios-dark">{email}</span>, we've sent a link to reset your password.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-flex w-full h-[50px] rounded-full text-white text-[14px] font-semibold items-center justify-center hover:opacity-90 transition-opacity"
              style={{ background: '#132A13' }}
            >
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-[26px] leading-tight font-bold" style={{ color: '#14532D' }}>Reset your password</h1>
            <p className="mt-2.5 text-[14px] text-ios-secondary leading-relaxed max-w-[320px]">
              Enter the email address on your account and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
              <div>
                <label htmlFor={emailId} className="sr-only">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-secondary/70 pointer-events-none" />
                  <input
                    id={emailId}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Email address"
                    className={`w-full h-[50px] rounded-full border bg-white pl-11 pr-5 text-[14px] text-ios-dark placeholder:text-ios-secondary/60 outline-none transition-colors focus:ring-4 ${
                      error ? 'border-apple-red focus:border-apple-red focus:ring-apple-red/10' : 'border-black/10 focus:border-[#14532D] focus:ring-[#14532D]/10'
                    }`}
                    disabled={loading}
                    autoComplete="email"
                    autoFocus
                    aria-invalid={!!error}
                    aria-describedby={error ? emailErrorId : undefined}
                  />
                </div>
                {error && <p id={emailErrorId} role="alert" className="mt-1.5 ml-1 text-xs text-apple-red">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-[50px] rounded-full text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100"
                style={{ background: '#132A13' }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Sending…</span>
                  </>
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-[13px] text-ios-secondary">
              Remembered it?{' '}
              <Link to="/login" className="font-semibold hover:underline" style={{ color: '#14532D' }}>Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
