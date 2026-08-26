/**
 * Billing Page - Enhanced with Usage Warnings, Proration Preview, and Invoice Details
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  CreditCard, Check, Download, ExternalLink, Loader2, AlertCircle,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info,
  Zap, Calendar, DollarSign, Users, MessageSquare, Phone, FileText,
  ArrowRight, X, RefreshCw, Settings, Coins
} from 'lucide-react';

interface BillingInfo {
  plan: {
    id: string;
    name: string;
    tier: string;
    monthlyPrice: number;
    annualPrice: number;
  };
  status: string;
  isOnTrial: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  usage: {
    contacts: { current: number; limit: number };
    messages: { current: number; limit: number; daysLeft: number };
    campaigns: { current: number; limit: number };
    templates: { current: number; limit: number };
  };
  nextBillingDate: string;
  nextBillingAmount: number;
  isMockMode: boolean;
  recentInvoices: Invoice[];
  paymentMethods: PaymentMethod[];
  pricePerMessage: number;
  pricePerContact: number;
}

interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: 'paid' | 'failed' | 'pending';
  paidAt?: string;
  lineItems?: { description: string; amount: number }[];
  taxAmount?: number;
  downloadUrl?: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface Plan {
  id: string;
  name: string;
  tier: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  limits: any;
  features: any;
  priceIds: { monthly: string; annual: string };
}

interface ProrationPreview {
  credit: number;
  charge: number;
  net: number;
  effectiveDate: string;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ACTIVE',
  TRIAL: 'TRIAL',
  SUSPENDED: 'SUSPENDED',
  CHURNED: 'CANCELLED',
  PENDING_SETUP: 'PENDING SETUP',
};

interface UsageAlert {
  contactsPercent: number;
  messagesPercent: number;
  contactsEnabled: boolean;
  messagesEnabled: boolean;
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [interval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [showUpgradeModal, setShowUpgradeModal] = useState<Plan | null>(null);
  const [showProration, setShowProration] = useState<ProrationPreview | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch billing data
  const { data: billingData, isLoading: billingLoading, refetch } = useQuery<{ data: BillingInfo }>({
    queryKey: ['billing'],
    queryFn: async () => {
      const response = await api.get('/billing');
      return response.data;
    },
  });

  // Fetch plans
  const { data: plansData } = useQuery<{ data: Plan[] }>({
    queryKey: ['billing', 'plans'],
    queryFn: async () => {
      const response = await api.get('/billing/plans');
      return response.data;
    },
  });

  // Fetch usage details
  const { data: usageData } = useQuery({
    queryKey: ['billing', 'usage'],
    queryFn: async () => {
      const response = await api.get('/billing/usage');
      return response.data;
    },
  });

  // Fetch proration
  const { data: prorationData } = useQuery({
    queryKey: ['billing', 'proration', showUpgradeModal?.tier],
    queryFn: async () => {
      if (!showUpgradeModal) return null;
      const response = await api.get('/billing/proration', {
        params: { newPlan: showUpgradeModal.tier }
      });
      return response.data;
    },
    enabled: !!showUpgradeModal,
  });

  // Mutations
  const checkoutMutation = useMutation({
    mutationFn: async ({ planTier, interval }: { planTier: string; interval: string }) => {
      const response = await api.post('/billing/checkout', { planTier, interval });
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.data?.url) {
        window.location.href = data.data.url;
      }
    },
    onError: (error: any) => {
      setNotification({ type: 'error', message: error.response?.data?.error?.message || 'Checkout failed' });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/billing/portal');
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.data?.url) {
        window.location.href = data.data.url;
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/billing/cancel');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      setShowCancelConfirm(false);
      setNotification({ type: 'success', message: 'Subscription cancelled. Access continues until end of billing period.' });
    },
    onError: (error: any) => {
      setShowCancelConfirm(false);
      setNotification({ type: 'error', message: error.response?.data?.error?.message || 'Failed to cancel' });
    },
  });

  const billing = billingData?.data;
  const plans = plansData?.data || [];
  const currentTier = billing?.plan?.tier;
  const usage = billing?.usage;

  // Helper functions
  const formatLimit = (val: number) => {
    if (val === -1) return '∞';
    if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
    return val.toString();
  };

  const getUsagePercent = (current: number, limit: number) => {
    if (!limit || limit === -1) return 0;
    return Math.round((current / limit) * 100);
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-apple-red';
    if (percent >= 75) return 'bg-apple-orange';
    return 'bg-wa-green';
  };

  const getUsageWarning = (percent: number, name: string) => {
    if (percent >= 90) return `Critical: You've used ${percent}% of your ${name} limit!`;
    if (percent >= 75) return `Warning: You've used ${percent}% of your ${name} limit.`;
    if (percent >= 50) return `Notice: You've used ${percent}% of your ${name} limit.`;
    return null;
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSelectPlan = (plan: Plan) => {
    setShowUpgradeModal(plan);
    if (prorationData?.data) {
      setShowProration(prorationData.data);
    }
  };

  const handleUpgrade = () => {
    if (showUpgradeModal) {
      checkoutMutation.mutate({ planTier: showUpgradeModal.tier, interval });
    }
  };

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-apple-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right ${
          notification.type === 'success' ? 'bg-apple-green text-white' : 'bg-apple-red text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gradient-wa">Billing & Subscription</h1>
        <p className="text-ios-secondary mt-1">Manage your plan, usage, and payment methods</p>
      </div>

      {/* Mock Mode Warning */}
      {billing?.isMockMode && (
        <div className="card-apple p-4 flex items-start gap-3 border border-apple-orange/30 bg-apple-orange/5">
          <AlertTriangle className="w-5 h-5 text-apple-orange mt-0.5" />
          <div>
            <p className="font-medium text-ios-dark">Mock Mode Active</p>
            <p className="text-sm text-ios-secondary">
              Stripe is in test mode. Add real credentials to process actual payments.
            </p>
          </div>
        </div>
      )}

      {/* Current Plan & Usage */}
      {billing && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Plan Card */}
          <div className="card-apple p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ios-dark">Current Plan</h2>
              <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                billing.status === 'ACTIVE' ? 'bg-apple-green/20 text-apple-green' :
                billing.status === 'TRIAL' ? 'bg-wa-green/20 text-wa-green' :
                'bg-apple-red/20 text-apple-red'
              }`}>
                {STATUS_LABELS[billing.status] || billing.status}
              </span>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-wa-gradient rounded-apple-xl flex items-center justify-center">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ios-dark">{billing.plan?.name}</p>
                <p className="text-ios-muted">
                  {Number(billing.plan?.monthlyPrice) < 0
                    ? 'Custom pricing'
                    : interval === 'monthly'
                    ? `$${billing.plan?.monthlyPrice}/month`
                    : `$${(billing.plan?.annualPrice / 12)?.toFixed(0)}/month`}
                </p>
              </div>
            </div>

            {/* Next Billing */}
            <div className="p-3 bg-ios-gray rounded-apple-lg mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ios-muted flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Next billing date
                </span>
                <span className="font-medium text-ios-dark">
                  {billing.nextBillingDate ? new Date(billing.nextBillingDate).toLocaleDateString() : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-ios-muted flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Amount due
                </span>
                <span className="font-medium text-ios-dark">
                  ${billing.nextBillingAmount?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            {/* Trial Banner */}
            {billing.isOnTrial && billing.trialDaysLeft > 0 && (
              <div className="mb-4 p-4 bg-wa-green/10 border border-wa-green/30 rounded-apple-lg">
                <p className="text-wa-green font-medium flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Free Trial Active
                </p>
                <p className="text-sm text-ios-dark mt-1">
                  {billing.trialDaysLeft} days remaining
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                className="w-full btn-apple btn-wa-green flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {portalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Manage Billing'}
              </button>
              {billing.status === 'ACTIVE' && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full text-sm text-apple-red hover:text-apple-red/80"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>

          {/* Usage Cards */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-ios-dark">Usage This Month</h2>

            {/* Contacts Usage */}
            <div className="card-apple p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-ios-dark">Contacts</p>
                    <p className="text-sm text-ios-muted">Maximum allowed: {formatLimit(usage?.contacts?.limit || 0)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-ios-dark">
                    {(usage?.contacts?.current || 0).toLocaleString()}
                  </p>
                  <p className="text-sm text-ios-muted">
                    {getUsagePercent(usage?.contacts?.current || 0, usage?.contacts?.limit || 0)}% used
                  </p>
                </div>
              </div>
              <div className="relative h-3 bg-ios-gray rounded-full overflow-hidden">
                <div
                  className={`absolute h-full transition-all ${getUsageColor(getUsagePercent(usage?.contacts?.current || 0, usage?.contacts?.limit || 0))}`}
                  style={{ width: `${Math.min(100, getUsagePercent(usage?.contacts?.current || 0, usage?.contacts?.limit || 0))}%` }}
                />
              </div>
              {getUsageWarning(getUsagePercent(usage?.contacts?.current || 0, usage?.contacts?.limit || 0), 'contacts') && (
                <p className="text-xs text-apple-orange mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {getUsageWarning(getUsagePercent(usage?.contacts?.current || 0, usage?.contacts?.limit || 0), 'contacts')}
                </p>
              )}
            </div>

            {/* Messages Usage */}
            <div className="card-apple p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-wa-teal/20 text-wa-teal rounded-apple-lg flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-ios-dark">Messages</p>
                    <p className="text-sm text-ios-muted">
                      {usage?.messages?.daysLeft || 0} days left this month
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-ios-dark">
                    {(usage?.messages?.current || 0).toLocaleString()}
                  </p>
                  <p className="text-sm text-ios-muted">
                    of {formatLimit(usage?.messages?.limit || 0)}
                  </p>
                </div>
              </div>
              <div className="relative h-3 bg-ios-gray rounded-full overflow-hidden">
                <div
                  className={`absolute h-full transition-all ${getUsageColor(getUsagePercent(usage?.messages?.current || 0, usage?.messages?.limit || 0))}`}
                  style={{ width: `${Math.min(100, getUsagePercent(usage?.messages?.current || 0, usage?.messages?.limit || 0))}%` }}
                />
              </div>
              {getUsageWarning(getUsagePercent(usage?.messages?.current || 0, usage?.messages?.limit || 0), 'messages') && (
                <p className="text-xs text-apple-orange mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {getUsageWarning(getUsagePercent(usage?.messages?.current || 0, usage?.messages?.limit || 0), 'messages')}
                </p>
              )}
              {/* Usage projection */}
              {usage?.messages?.daysLeft && usage?.messages?.daysLeft > 0 && (
                <div className="mt-3 p-3 bg-ios-gray/50 rounded-apple-lg">
                  <p className="text-xs text-ios-muted flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    At current pace, you'll use ~{Math.round((usage?.messages?.current || 0) / (30 - (usage?.messages?.daysLeft || 0)) * 30).toLocaleString()} messages this month
                  </p>
                </div>
              )}
            </div>

            {/* Campaign & Template Usage */}
            <div className="grid grid-cols-2 gap-4">
              <div className="card-apple p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-apple-purple/20 text-apple-purple rounded-apple-lg flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <p className="font-medium text-ios-dark">Campaigns</p>
                </div>
                <p className="text-2xl font-bold text-ios-dark">
                  {usage?.campaigns?.current || 0}
                  <span className="text-base font-normal text-ios-muted"> / {formatLimit(usage?.campaigns?.limit || 0)}</span>
                </p>
              </div>
              <div className="card-apple p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-apple-orange/20 text-apple-orange rounded-apple-lg flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <p className="font-medium text-ios-dark">Templates</p>
                </div>
                <p className="text-2xl font-bold text-ios-dark">
                  {usage?.templates?.current || 0}
                  <span className="text-base font-normal text-ios-muted"> / {formatLimit(usage?.templates?.limit || 0)}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div className="card-apple p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-ios-dark">Available Plans</h2>
          <div className="inline-flex bg-ios-gray rounded-apple-lg p-1">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-4 py-1.5 text-sm font-medium rounded-apple transition ${
                interval === 'monthly' ? 'bg-white shadow-sm text-ios-dark' : 'text-ios-secondary'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('annual')}
              className={`px-4 py-1.5 text-sm font-medium rounded-apple transition ${
                interval === 'annual' ? 'bg-white shadow-sm text-ios-dark' : 'text-ios-secondary'
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs text-apple-green font-semibold">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.filter(p => p.tier !== 'ENTERPRISE').map((plan) => {
            const price = interval === 'monthly'
              ? Number(plan.monthlyPrice)
              : Number(plan.annualPrice) / 12;
            const isCurrent = currentTier === plan.tier;
            const isPopular = plan.tier === 'GROWTH';
            const isDowngrade = getPlanOrder(currentTier) > getPlanOrder(plan.tier);
            const isUpgrade = getPlanOrder(currentTier) < getPlanOrder(plan.tier);

            return (
              <div
                key={plan.id}
                className={`relative rounded-apple-xl border-2 p-6 ${
                  isPopular ? 'border-wa-green' : 'border-black/10'
                } ${isCurrent ? 'bg-wa-green/5' : ''}`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-wa-green text-white text-xs font-medium rounded-apple-full">
                    Most Popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 right-4 px-3 py-1 bg-apple-green text-white text-xs font-medium rounded-apple-full">
                    Current
                  </div>
                )}

                <h3 className="text-xl font-bold text-ios-dark">{plan.name}</h3>
                <p className="text-sm text-ios-muted mt-1">{plan.description}</p>

                <div className="mt-4 mb-6">
                  <span className="text-4xl font-bold text-ios-dark">
                    ${Number.isInteger(price) ? price : price.toFixed(0)}
                  </span>
                  <span className="text-ios-muted">/month</span>
                  {interval === 'annual' && (
                    <p className="text-sm text-apple-green mt-1">
                      ${plan.annualPrice}/year
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isCurrent || checkoutMutation.isPending}
                  className={`w-full py-2.5 rounded-apple-lg font-medium transition flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-ios-gray text-ios-muted cursor-not-allowed'
                      : isUpgrade
                      ? 'btn-apple btn-wa-green'
                      : 'bg-apple-orange/20 text-apple-orange hover:bg-apple-orange/30'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : isUpgrade ? (
                    <>Upgrade <ArrowRight className="w-4 h-4" /></>
                  ) : (
                    <>Downgrade <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-apple-green" />
                    <span>{formatLimit(plan.limits?.maxContacts)} contacts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-apple-green" />
                    <span>{formatLimit(plan.limits?.maxMessagesPerMonth)} messages/mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-apple-green" />
                    <span>{plan.limits?.maxPhoneNumbers} phone number(s)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-apple-green" />
                    <span>{plan.limits?.maxTeamMembers} team members</span>
                  </li>
                  {plan.features?.chatbotBuilder && (
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-apple-green" />
                      <span>Chatbot Builder</span>
                    </li>
                  )}
                  {plan.features?.apiAccess && (
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-apple-green" />
                      <span>API Access</span>
                    </li>
                  )}
                  {plan.features?.whatsappFlows && (
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-apple-green" />
                      <span>WhatsApp Flows</span>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Methods */}
      {billing?.paymentMethods && billing.paymentMethods.length > 0 && (
        <div className="card-apple p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ios-dark">Payment Methods</h2>
            <button
              onClick={() => portalMutation.mutate()}
              className="text-sm text-wa-green hover:underline flex items-center gap-1"
            >
              <Settings className="w-4 h-4" />
              Manage
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {billing.paymentMethods.map((pm) => (
              <div key={pm.id} className="flex items-center gap-4 p-4 bg-ios-gray rounded-apple-lg">
                <div className="w-12 h-8 bg-ios-dark rounded flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-ios-dark flex items-center gap-2">
                    {pm.brand} •••• {pm.last4}
                    {pm.isDefault && (
                      <span className="text-xs bg-apple-green/20 text-apple-green px-2 py-0.5 rounded-full">Default</span>
                    )}
                  </p>
                  <p className="text-sm text-ios-muted">Expires {pm.expMonth}/{pm.expYear}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Invoices */}
      <div className="card-apple p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ios-dark">Billing History</h2>
          <button
            onClick={() => portalMutation.mutate()}
            className="text-sm text-wa-green hover:underline"
          >
            View All
          </button>
        </div>
        {billing?.recentInvoices && billing.recentInvoices.length > 0 ? (
          <div className="space-y-2">
            {billing.recentInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg hover:bg-ios-gray/50 transition"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-apple-lg flex items-center justify-center ${
                    invoice.status === 'paid' ? 'bg-apple-green/20 text-apple-green' :
                    invoice.status === 'failed' ? 'bg-apple-red/20 text-apple-red' :
                    'bg-apple-orange/20 text-apple-orange'
                  }`}>
                    {invoice.status === 'paid' ? <CheckCircle2 className="w-5 h-5" /> :
                     invoice.status === 'failed' ? <AlertCircle className="w-5 h-5" /> :
                     <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-ios-dark">{invoice.number}</p>
                    <p className="text-sm text-ios-muted">
                      {new Date(invoice.date).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium text-ios-dark">${Number(invoice.amount).toFixed(2)}</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    invoice.status === 'paid' ? 'bg-apple-green/20 text-apple-green' :
                    invoice.status === 'failed' ? 'bg-apple-red/20 text-apple-red' :
                    'bg-apple-orange/20 text-apple-orange'
                  }`}>
                    {invoice.status}
                  </span>
                  {invoice.downloadUrl && (
                    <a
                      href={invoice.downloadUrl}
                      className="p-2 hover:bg-ios-gray rounded-apple-lg transition"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4 text-ios-muted" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Coins className="w-12 h-12 text-ios-muted mx-auto mb-3 opacity-50" />
            <p className="text-ios-secondary">No invoices yet</p>
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">
                {getPlanOrder(currentTier) < getPlanOrder(showUpgradeModal.tier) ? 'Upgrade' : 'Change'} to {showUpgradeModal.name}
              </h3>
              <button onClick={() => setShowUpgradeModal(null)} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            {/* Proration Preview */}
            {prorationData?.data && (
              <div className="p-4 bg-ios-gray rounded-apple-lg mb-6">
                <p className="text-sm font-medium text-ios-dark mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Proration Preview
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ios-muted">Credit from current plan</span>
                    <span className="text-apple-green">-${prorationData.data.credit?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ios-muted">Charge for new plan</span>
                    <span className="text-apple-red">+${prorationData.data.charge?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-black/5 font-medium">
                    <span className="text-ios-dark">Due today</span>
                    <span className="text-ios-dark">${prorationData.data.net?.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-ios-muted mt-2">
                    Effective immediately. Next billing: {new Date(prorationData.data.effectiveDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleUpgrade}
                disabled={checkoutMutation.isPending}
                className="flex-1 py-3 btn-apple btn-wa-green rounded-apple-lg font-medium flex items-center justify-center gap-2"
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Confirm {getPlanOrder(currentTier) < getPlanOrder(showUpgradeModal.tier) ? 'Upgrade' : 'Change'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <button
                onClick={() => setShowUpgradeModal(null)}
                className="flex-1 py-3 btn-apple btn-apple-outline rounded-apple-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Confirm Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-ios-dark mb-2">Cancel subscription?</h3>
            <p className="text-sm text-ios-secondary mb-6">
              You'll keep access to {billing?.plan?.name || 'your current plan'} until the end of your current billing period, then your workspace drops to the free tier limits.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-3 btn-apple btn-apple-outline rounded-apple-lg"
                disabled={cancelMutation.isPending}
              >
                Keep Subscription
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 py-3 bg-apple-red text-white font-semibold rounded-apple-lg hover:bg-apple-red/90 transition disabled:opacity-50"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions
function getPlanOrder(tier?: string): number {
  const order = { 'STARTER': 1, 'GROWTH': 2, 'BUSINESS': 3, 'ENTERPRISE': 4 };
  return order[tier as keyof typeof order] || 0;
}

// Missing icon import fix
function Send(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="22" x2="11" y1="2" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function Clock(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
