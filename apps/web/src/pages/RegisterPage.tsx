/**
 * Registration Page
 * Apple Design System
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { Eye, EyeOff, Lock, Mail, Building, CheckCircle } from 'lucide-react';

const STEPS = ['Account', 'Workspace', 'Verify'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    phone: '',
    plan: 'STARTER',
  });
  const [showPassword, setShowPassword] = useState(false);

  const updateForm = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step === 0) {
      if (!form.name || !form.email || !form.password) {
        setError('Please fill in all required fields');
        return;
      }
      nextStep();
      return;
    }

    if (step === 1) {
      if (!form.company) {
        setError('Please enter your company name');
        return;
      }
      setLoading(true);
      try {
        await api.post('/auth/register', form);
        nextStep();
      } catch (err: any) {
        setError(err.response?.data?.message || 'Registration failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    // step === 2: account already created, just head to sign in
    navigate('/login');
  };

  const passwordStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = passwordStrength(form.password);
  const strengthColors = ['bg-apple-red', 'bg-apple-orange', 'bg-apple-yellow', 'bg-apple-green'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="min-h-screen bg-ios-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-wa-green to-wa-green/70 rounded-apple-xl flex items-center justify-center mx-auto mb-4 shadow-apple-lg">
            <svg viewBox="0 0 24 24" className="w-9 h-9 text-white" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ios-dark">Create your account</h1>
          <p className="text-ios-secondary mt-1">Get started with Kriscel WA</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition ${
                i < step ? 'bg-apple-green text-white' :
                i === step ? 'bg-wa-green text-white' :
                'bg-ios-gray text-ios-muted'
              }`}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm ${i === step ? 'text-ios-dark font-medium' : 'text-ios-muted'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-black/10" />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="card-apple p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 0 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="Jane Smith"
                    className="input-apple w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Work Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                      placeholder="jane@company.com"
                      className="input-apple w-full pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => updateForm('password', e.target.value)}
                      placeholder="Min. 8 characters"
                      className="input-apple w-full pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted hover:text-ios-secondary transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full ${i < strength ? strengthColors[strength - 1] : 'bg-ios-gray'}`}
                          />
                        ))}
                      </div>
                      <p className={`text-xs ${strength > 0 ? strengthColors[strength - 1].replace('bg-', 'text-') : 'text-ios-muted'}`}>
                        {strength > 0 ? strengthLabels[strength - 1] : ''}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Company Name</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
                    <input
                      type="text"
                      value={form.company}
                      onChange={(e) => updateForm('company', e.target.value)}
                      placeholder="Acme Corporation"
                      className="input-apple w-full pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Phone Number (optional)</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateForm('phone', e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="input-apple w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Plan</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['STARTER', 'GROWTH', 'BUSINESS'].map((plan) => (
                      <button
                        key={plan}
                        type="button"
                        onClick={() => updateForm('plan', plan)}
                        className={`py-2.5 text-sm font-medium rounded-apple-lg border transition ${
                          form.plan === plan
                            ? 'border-wa-green bg-wa-green/5 text-wa-green'
                            : 'border-black/10 text-ios-secondary hover:border-black/30'
                        }`}
                      >
                        {plan}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-apple-green/20 text-apple-green rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-ios-dark">Account created</h3>
                <p className="text-ios-secondary mt-2 text-sm">
                  Your workspace <strong className="text-ios-dark">{form.company}</strong> is ready. Sign in to get started.
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-apple-red/10 border border-apple-red/20 text-apple-red text-sm p-3 rounded-apple-lg">
                {error}
              </div>
            )}

            {/* Nav buttons */}
            <div className="flex gap-3">
              {step > 0 && step < 2 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 py-3 border border-black/10 text-ios-secondary font-medium rounded-apple-lg hover:bg-ios-gray transition"
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 bg-wa-green text-white font-semibold rounded-apple-lg hover:bg-wa-green/90 transition disabled:opacity-50"
              >
                {loading ? 'Please wait...' : step === 2 ? 'Go to Sign In' : 'Continue'}
              </button>
            </div>
          </form>

          {step < 2 && (
            <div className="mt-6 text-center">
              <p className="text-sm text-ios-secondary">
                Already have an account?{' '}
                <Link to="/login" className="text-wa-green font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
