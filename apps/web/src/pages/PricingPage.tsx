/**
 * Public Pricing Page - No auth required
 * Apple Design System
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, MessageSquare, Users, Bot, Zap, Shield } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Plan {
  id: string;
  name: string;
  tier: string;
  monthlyPrice: number;
  annualPrice: number;
  cashfreeGstRatePercent: number;
  cashfreeMonthlyBaseInr: number;
  cashfreeMonthlyGstInr: number;
  cashfreeMonthlyTotalInr: number;
  cashfreeAnnualBaseInr: number;
  cashfreeAnnualGstInr: number;
  cashfreeAnnualTotalInr: number;
  description: string;
  maxContacts: number;
  maxMessagesPerMonth: number;
  maxPhoneNumbers: number;
  maxTeamMembers: number;
  hasAnalytics: boolean;
  hasChatbotBuilder: boolean;
  hasWhatsAppFlows: boolean;
  hasAPI: boolean;
  hasAIChatbot: boolean;
  hasPrioritySupport: boolean;
  hasAdvancedAnalytics: boolean;
  hasWhiteLabel: boolean;
  hasDripCampaigns: boolean;
  hasABTesting: boolean;
}

const features = [
  {
    icon: MessageSquare,
    title: 'Inbox & Conversations',
    description: 'Multi-agent inbox with conversation routing, tags, and internal notes.',
  },
  {
    icon: Users,
    title: 'Contact Management',
    description: 'Unlimited contacts, custom fields, segments, and import/export.',
  },
  {
    icon: Bot,
    title: 'Chatbot Builder',
    description: 'Visual flow builder with conditions, triggers, and AI integration.',
  },
  {
    icon: Zap,
    title: 'Customer Messaging',
    description: 'Manage customer updates, schedule campaigns for opted-in contacts, and track delivery.',
  },
  {
    icon: Shield,
    title: 'Workspace Access Controls',
    description: 'Manage team access and workspace settings from a shared customer-support platform.',
  },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  const { data: plansData } = useQuery<{ data: Plan[] }>({
    queryKey: ['public-plans'],
    queryFn: async () => {
      const response = await api.get('/plans');
      return response.data;
    },
  });

  const plans = plansData?.data || [];
  const formatInr = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const formatLimit = (val: number) => {
    if (val === -1) return 'Unlimited';
    if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
    return val.toLocaleString();
  };

  const handleSelect = (tier: string) => {
    if (user) {
      navigate(`/billing?plan=${tier}&interval=${interval}`);
    } else {
      navigate(`/register?plan=${tier}`);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--apple-bg)]">
      {/* Apple Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="blob-apple-1 -top-60 -left-60" />
        <div className="blob-apple-2 top-1/3 -right-60" />
        <div className="blob-apple-3 bottom-40 left-1/3" />
        <div className="absolute inset-0 bg-grid-apple" />
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 px-4 pt-3">
        <div className="glass-nav mx-auto max-w-7xl rounded-2xl">
          <div className="flex items-center justify-between h-14 px-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-wa-gradient rounded-lg flex items-center justify-center shadow-wa-green">
                <span className="text-white font-bold text-xs">WA</span>
              </div>
              <span className="font-semibold text-primary-apple">Kriscel WA</span>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <button
                  onClick={() => navigate('/')}
                  className="btn-apple btn-wa-green px-4 py-1.5 text-sm"
                >
                  Dashboard
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="btn-apple btn-apple-ghost px-4 py-1.5 text-sm"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => navigate('/register')}
                    className="btn-apple btn-wa-green px-4 py-1.5 text-sm"
                  >
                    Start Free Trial
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-20 pb-12 text-center px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-primary-apple mb-6 tracking-tight">
          Customer Support Helpdesk &amp; Omnichannel CRM Software
        </h1>
        <p className="text-lg text-secondary-apple mb-8 max-w-3xl mx-auto">
          B2B SaaS for managing customer conversations, support workflows, WhatsApp-connected inboxes,
          chatbot automation, and team collaboration.
        </p>

        {/* Apple Billing Toggle */}
        <div className="inline-flex bg-apple-bg-tertiary rounded-xl p-1 mb-8">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
              interval === 'monthly'
                ? 'bg-white shadow-apple text-primary-apple'
                : 'text-secondary-apple hover:text-primary-apple'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('annual')}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
              interval === 'annual'
                ? 'bg-white shadow-apple text-primary-apple'
                : 'text-secondary-apple hover:text-primary-apple'
            }`}
          >
            Annual
            <span className="ml-2 px-2 py-0.5 bg-apple-green/10 text-apple-green text-xs rounded-full font-semibold">
              Save 20%
            </span>
          </button>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.filter(p => p.tier !== 'ENTERPRISE').map((plan) => {
            const isPopular = plan.tier === 'GROWTH';
            const baseInr = interval === 'monthly'
              ? Number(plan.cashfreeMonthlyBaseInr)
              : Number(plan.cashfreeAnnualBaseInr);
            const gstInr = interval === 'monthly'
              ? Number(plan.cashfreeMonthlyGstInr)
              : Number(plan.cashfreeAnnualGstInr);
            const totalInr = interval === 'monthly'
              ? Number(plan.cashfreeMonthlyTotalInr)
              : Number(plan.cashfreeAnnualTotalInr);
            const price = interval === 'monthly' ? totalInr : totalInr / 12;

            return (
              <div
                key={plan.id}
                className={`relative rounded-ios-2xl p-6 ${
                  isPopular
                    ? 'bg-wa-gradient shadow-wa-green scale-[1.02]'
                    : 'card-apple'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-white text-wa-green text-xs font-semibold rounded-full shadow-apple">
                    Most Popular
                  </div>
                )}

                <h3 className={`text-xl font-bold ${isPopular ? 'text-white' : 'text-primary-apple'}`}>
                  {plan.name}
                </h3>
                <p className={`mt-2 min-h-[48px] text-sm ${isPopular ? 'text-white/80' : 'text-secondary-apple'}`}>
                  {plan.description}
                </p>

                <div className="mt-6">
                  <span className={`text-5xl font-bold ${isPopular ? 'text-white' : 'text-primary-apple'}`}>
                    {formatInr(price)}
                  </span>
                  <span className={`text-sm ${isPopular ? 'text-white/70' : 'text-secondary-apple'}`}>/month</span>
                  <div className={`mt-2 space-y-1 text-xs ${isPopular ? 'text-white/80' : 'text-secondary-apple'}`}>
                    <p>Plan price {formatInr(baseInr)}{interval === 'monthly' ? '/month' : '/year'}</p>
                    <p>GST ({plan.cashfreeGstRatePercent}%) {formatInr(gstInr)}{interval === 'monthly' ? '/month' : '/year'}</p>
                    {interval === 'annual' && <p>Annual total {formatInr(totalInr)}/year</p>}
                    <p>Cashfree total {formatInr(totalInr)}{interval === 'monthly' ? '/month' : '/year'} including GST</p>
                  </div>
                </div>

                <button
                  onClick={() => handleSelect(plan.tier)}
                  className={`w-full mt-6 py-3 rounded-xl font-medium transition-all ${
                    isPopular
                      ? 'bg-white text-wa-green hover:bg-white/90 shadow-apple'
                      : 'bg-wa-gradient text-white hover:shadow-wa-green'
                  }`}
                >
                  View plan
                </button>

                <ul className="mt-8 space-y-3">
                  <li className="flex items-start gap-2 text-sm">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                    <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>{formatLimit(plan.maxContacts)} contacts</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                    <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>{formatLimit(plan.maxMessagesPerMonth)} messages/month</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                    <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>{plan.maxPhoneNumbers} phone number(s)</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                    <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>{plan.maxTeamMembers} team members</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                    <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>{plan.hasAnalytics ? 'Advanced' : 'Basic'} analytics</span>
                  </li>
                  {plan.hasChatbotBuilder && (
                    <li className="flex items-start gap-2 text-sm">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                      <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>Visual chatbot builder</span>
                    </li>
                  )}
                  {plan.hasAPI && (
                    <li className="flex items-start gap-2 text-sm">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                      <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>REST API access</span>
                    </li>
                  )}
                  {plan.hasWhatsAppFlows && (
                    <li className="flex items-start gap-2 text-sm">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                      <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>WhatsApp Flows</span>
                    </li>
                  )}
                  {plan.hasAIChatbot && (
                    <li className="flex items-start gap-2 text-sm">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                      <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>AI Chatbot (GPT-4 / Claude)</span>
                    </li>
                  )}
                  {plan.hasPrioritySupport && (
                    <li className="flex items-start gap-2 text-sm">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                      <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>24/7 priority support</span>
                    </li>
                  )}
                  {plan.hasWhiteLabel && (
                    <li className="flex items-start gap-2 text-sm">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPopular ? 'text-white' : 'text-apple-green'}`} />
                      <span className={isPopular ? 'text-white/90' : 'text-primary-apple'}>White label option</span>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Enterprise */}
        <div className="mt-6 rounded-ios-2xl bg-wa-gradient p-8 text-white text-center shadow-wa-green">
          <h3 className="text-2xl font-bold mb-2">Need more?</h3>
          <p className="mb-6 opacity-90">
            Custom Enterprise plans with unlimited scale, white-label option, SLA, and dedicated support.
          </p>
          <button
            onClick={() => navigate('/contact')}
            className="btn-apple bg-white text-wa-green hover:bg-white/90 px-6 py-3"
          >
            Contact Sales
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="relative py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-apple mb-4 tracking-tight">
              Everything you need
            </h2>
            <p className="text-xl text-secondary-apple">
              Built for teams of all sizes
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5">
            {features.map((feature) => (
              <div key={feature.title} className="card-apple p-5 text-center">
                <div className="w-12 h-12 bg-wa-gradient rounded-xl flex items-center justify-center mb-4 mx-auto shadow-wa-green">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-primary-apple mb-2">{feature.title}</h3>
                <p className="text-sm text-secondary-apple">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-primary-apple mb-12 tracking-tight">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: 'How does the free trial work?',
                a: '14 days of full access to all features. No credit card required. Cancel anytime.',
              },
              {
                q: 'Can I change plans later?',
                a: 'Yes, upgrade or downgrade at any time. Changes are prorated.',
              },
              {
                q: 'How are Cashfree plan prices calculated?',
                a: 'Cashfree plan prices are charged in INR using the configured USD-to-INR conversion rate. The amount is rounded to the nearest paise.',
              },
              {
                q: 'Are taxes included?',
                a: 'For Cashfree plan checkout, an 18% GST amount is added to the displayed base plan price and itemized before payment.',
              },
              {
                q: 'Can I message my customers?',
                a: 'The service supports customer communications. You are responsible for obtaining required consent and following WhatsApp, Meta, and applicable messaging rules.',
              },
              {
                q: 'Do Cashfree plans renew automatically?',
                a: 'No. Cashfree plan purchases are prepaid for the selected term and do not auto-renew.',
              },
            ].map((faq) => (
              <div key={faq.q} className="card-apple p-5">
                <h3 className="font-semibold text-primary-apple mb-2">{faq.q}</h3>
                <p className="text-secondary-apple">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-ios-2xl bg-wa-gradient p-10 text-center shadow-wa-green overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid2)" />
              </svg>
            </div>
            <div className="relative z-10">
              <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Ready to get started?</h2>
              <p className="text-xl text-white/80 mb-8">
                Start your 14-day free trial today. No credit card required.
              </p>
              <button
                onClick={() => navigate(user ? '/billing' : '/register')}
                className="btn-apple bg-white text-wa-green hover:bg-white/90 px-8 py-4 text-lg shadow-apple"
              >
                Start Free Trial
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 text-center">
        <p className="mx-auto mb-5 max-w-3xl px-4 text-xs text-secondary-apple">
          Cashfree plan prices are shown in INR using the configured USD-to-INR rate. Checkout adds 18% GST to
          the base plan price and shows the tax amount and total before payment.
        </p>
        <nav aria-label="Legal and business information" className="mb-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link to="/contact" className="text-secondary-apple hover:text-wa-green">Contact Us</Link>
          <Link to="/pricing" className="text-secondary-apple hover:text-wa-green">Pricing</Link>
          <Link to="/terms" className="text-secondary-apple hover:text-wa-green">Terms and Conditions</Link>
          <Link to="/privacy" className="text-secondary-apple hover:text-wa-green">Privacy Policy</Link>
          <Link to="/refund-policy" className="text-secondary-apple hover:text-wa-green">
            Return/Refund/Cancellation Policy
          </Link>
        </nav>
        <p className="text-secondary-apple text-sm">
          © {new Date().getFullYear()} Kriscel Tech Pvt Ltd. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
