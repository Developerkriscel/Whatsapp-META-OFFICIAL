/**
 * Login Page — Kriscel WA
 * WhatsApp Business API White List Provider.
 * Matches the approved reference: bordered full-width desktop card with
 * header/footer + two-column body, genuinely restructured single-column
 * mobile composition.
 */

import { useState, useEffect, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Mail, Lock, ShieldCheck, Users, Headphones } from 'lucide-react';
import KriscelWaBrandmark from '../components/KriscelWaBrandmark';
import loginIllustrationSrc from '../assets/login-illustration.png';

const HEADING_GREEN = '#14532D';
const CTA_DARK = '#132A13';
const MINT_BORDER = '#CFE9C3';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const formErrorId = useId();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(user?.isSuperadmin ? '/superadmin' : '/', { replace: true });
    }
  }, [isAuthenticated, navigate, user]);

  const validate = () => {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Please enter your email address.';
    } else if (!isValidEmail(email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Please enter your password.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!validate()) return;

    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      navigate(loggedUser?.isSuperadmin ? '/superadmin' : '/', { replace: true });
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401 || status === 400) {
        setFormError('That email and password combination doesn\'t match our records.');
      } else if (status === 403) {
        setFormError(err.response?.data?.error?.message || 'This account cannot sign in right now.');
      } else {
        setFormError('We couldn\'t sign you in. Please try again in a moment.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-[#F4F3F0] relative overflow-hidden flex items-center justify-center p-3 sm:p-5 lg:p-6">
      <BackgroundArcs />

      <div className="relative w-full max-w-[1000px] max-h-full bg-white rounded-[22px] sm:rounded-[28px] border border-black/[0.06] shadow-[0_2px_24px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-7 sm:py-4 border-b border-black/[0.06] shrink-0">
          <KriscelWaBrandmark compact />
          <Link
            to="/register"
            className="hidden sm:flex items-center gap-1.5 text-[12px] px-3.5 py-1.5 rounded-full border border-black/10 hover:bg-black/[0.02] transition-colors shrink-0"
          >
            <span className="text-black/50">New here?</span>
            <span className="font-semibold" style={{ color: HEADING_GREEN }}>Sign up</span>
          </Link>
        </div>

        {/* Body */}
        <div className="lg:flex overflow-hidden">
          {/* Left — illustration + value props (desktop only) */}
          <div className="hidden lg:flex lg:w-1/2 flex-col px-8 py-6 border-r border-black/[0.06]">
            <div className="flex-1 flex flex-col items-center justify-center text-center min-h-0">
              <LoginIllustration />
              <h2 className="mt-4 text-[21px] leading-[1.2] font-bold" style={{ color: HEADING_GREEN }}>
                Grow Conversations.<br />Build Connections.
              </h2>
              <p className="mt-2 text-[13px] text-black/55 leading-relaxed max-w-[300px]">
                Kriscel WA is a trusted WhatsApp White List Provider for your business.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-5 shrink-0">
              <TrustItem icon={<ShieldCheck className="w-4 h-4" strokeWidth={1.75} />} lines={['100% Compliant', 'WhatsApp Policies']} />
              <TrustItem icon={<Users className="w-4 h-4" strokeWidth={1.75} />} lines={['Quick Onboarding', 'Get Whitelisted Fast']} />
              <TrustItem icon={<Headphones className="w-4 h-4" strokeWidth={1.75} />} lines={['Reliable Support', 'Always Here to Help']} />
            </div>
          </div>

          {/* Right — auth form */}
          <div className="w-full lg:w-1/2 flex items-center justify-center px-5 py-4 sm:px-7 sm:py-5">
            <div className="w-full max-w-[360px]">
              {/* Mobile-only illustration + copy (own composition, not a shrink of desktop) */}
              <div className="lg:hidden flex flex-col items-center text-center mb-4">
                <LoginIllustration compact />
                <h2 className="mt-3 text-[18px] leading-[1.25] font-bold" style={{ color: HEADING_GREEN }}>
                  Grow Conversations.<br />Build Connections.
                </h2>
                <p className="mt-1.5 text-[12px] text-black/55 leading-relaxed max-w-[280px]">
                  Kriscel WA is a trusted WhatsApp White List Provider for your business.
                </p>
                <div className="flex gap-1.5 w-full max-w-[160px] mt-3" aria-hidden="true">
                  <span className="h-1.5 flex-1 rounded-full" style={{ background: HEADING_GREEN }} />
                  <span className="h-1.5 flex-1 rounded-full bg-black/10" />
                  <span className="h-1.5 flex-1 rounded-full bg-black/10" />
                </div>
              </div>

              <div className="hidden lg:block">
                <h1 className="text-[21px] font-bold" style={{ color: HEADING_GREEN }}>Welcome Back!</h1>
                <p className="mt-1 text-[13px] text-black/55">Login to your Kriscel WA account</p>
              </div>

              <form onSubmit={handleSubmit} noValidate className="mt-4 lg:mt-5 space-y-2.5">
                {/* Email */}
                <div>
                  <label htmlFor={emailId} className="sr-only">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
                    <input
                      id={emailId}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                      }}
                      placeholder="Email"
                      className={`w-full h-[42px] rounded-full border bg-white pl-11 pr-5 text-[14px] text-ios-dark placeholder:text-black/35 outline-none transition-colors focus:ring-4 ${
                        fieldErrors.email
                          ? 'border-apple-red focus:border-apple-red focus:ring-apple-red/10'
                          : 'border-black/10 focus:border-[#14532D] focus:ring-[#14532D]/10'
                      }`}
                      disabled={loading}
                      autoComplete="email"
                      autoFocus
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby={fieldErrors.email ? emailErrorId : undefined}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p id={emailErrorId} className="mt-1.5 ml-1 text-xs text-apple-red">{fieldErrors.email}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label htmlFor={passwordId} className="sr-only">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
                    <input
                      id={passwordId}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                      }}
                      placeholder="Password"
                      className={`w-full h-[42px] rounded-full border bg-white pl-11 pr-11 text-[14px] text-ios-dark placeholder:text-black/35 outline-none transition-colors focus:ring-4 ${
                        fieldErrors.password
                          ? 'border-apple-red focus:border-apple-red focus:ring-apple-red/10'
                          : 'border-black/10 focus:border-[#14532D] focus:ring-[#14532D]/10'
                      }`}
                      disabled={loading}
                      autoComplete="current-password"
                      aria-invalid={!!fieldErrors.password}
                      aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-black/35 hover:text-ios-dark transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p id={passwordErrorId} className="mt-1.5 ml-1 text-xs text-apple-red">{fieldErrors.password}</p>
                  )}
                </div>

                <div className="text-center pt-0.5">
                  <Link to="/forgot-password" className="text-[13px] underline hover:opacity-80 transition-opacity" style={{ color: HEADING_GREEN }}>
                    Forgot Password?
                  </Link>
                </div>

                {formError && (
                  <div id={formErrorId} role="alert" className="px-4 py-3 bg-apple-red/10 text-apple-red text-[13px] rounded-2xl">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  aria-describedby={formError ? formErrorId : undefined}
                  className="w-full h-[42px] rounded-full text-white text-[15px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100"
                  style={{ background: CTA_DARK }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Signing in…</span>
                    </>
                  ) : (
                    'Login'
                  )}
                </button>
              </form>

              <p className="mt-4 text-center text-[12px] text-black/50">
                Don't have an account?{' '}
                <Link to="/register" className="font-semibold hover:underline" style={{ color: HEADING_GREEN }}>Sign up</Link>
              </p>
            </div>
          </div>
        </div>

        {/* Footer — desktop only */}
        <div className="hidden lg:flex items-center justify-between px-7 py-2.5 border-t border-black/[0.06] text-[11px] text-black/40 shrink-0">
          <span>© {new Date().getUTCFullYear()} Kriscel WA. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-black/60 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-black/60 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustItem({ icon, lines }: { icon: React.ReactNode; lines: [string, string] }) {
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: MINT_BORDER, color: HEADING_GREEN }}>
        {icon}
      </div>
      <div className="text-[11px] leading-snug text-black/60">
        <div className="font-semibold text-black/75">{lines[0]}</div>
        <div>{lines[1]}</div>
      </div>
    </div>
  );
}

function LoginIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <img
      src={loginIllustrationSrc}
      alt=""
      aria-hidden="true"
      className={compact ? 'w-full max-w-[110px]' : 'w-full max-w-[170px]'}
    />
  );
}

function BackgroundArcs() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
      viewBox="0 0 1440 900"
      aria-hidden="true"
    >
      <path d="M-100 120 C 300 40, 700 40, 1000 160" stroke="#000000" strokeOpacity="0.035" strokeWidth="1.5" fill="none" />
      <path d="M-150 260 C 250 180, 650 180, 950 300" stroke="#000000" strokeOpacity="0.03" strokeWidth="1.5" fill="none" />
      <path d="M500 900 C 800 780, 1200 780, 1540 860" stroke="#000000" strokeOpacity="0.03" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

