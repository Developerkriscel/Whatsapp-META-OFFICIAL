/**
 * Billing Analytics - For super admins
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  TrendingUp,
  DollarSign,
  Users,
  AlertCircle,
  CreditCard,
  Activity,
} from 'lucide-react';

interface BillingStats {
  totalMRR: number;
  totalARR: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  churnRate: number;
  ltv: number;
  planBreakdown: { tier: string; count: number; mrr: number }[];
  recentEvents: any[];
}

interface RevenueData {
  month: string;
  mrr: number;
  newRevenue: number;
  churned: number;
}

export default function BillingAnalyticsPage() {
  const { data: billingData } = useQuery({
    queryKey: ['superadmin', 'billing'],
    queryFn: async () => {
      const response = await api.get('/superadmin/billing');
      return response.data;
    },
  });

  const { data: tenantsData } = useQuery({
    queryKey: ['superadmin', 'tenants'],
    queryFn: async () => {
      const response = await api.get('/superadmin/tenants', { params: { limit: 100 } });
      return response.data;
    },
  });

  const tenants = tenantsData?.data?.data || [];
  const stats = billingData?.data;

  const planCounts = tenants.reduce((acc: Record<string, number>, t: any) => {
    const tier = t.planName || (typeof t.plan === 'string' ? t.plan : t.plan?.name) || 'STARTER';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});

  const revenueData: RevenueData[] = [
    { month: 'Jan', mrr: 28000, newRevenue: 4500, churned: 800 },
    { month: 'Feb', mrr: 31200, newRevenue: 5200, churned: 1200 },
    { month: 'Mar', mrr: 33800, newRevenue: 4800, churned: 1200 },
    { month: 'Apr', mrr: 36400, newRevenue: 4900, churned: 1300 },
  ];

  const maxMRR = revenueData.length > 0 ? Math.max(...revenueData.map(d => d.mrr)) : 1;

  const cards = [
    {
      label: 'Monthly Recurring Revenue',
      value: `$${(stats?.totalMRR || 0).toLocaleString()}`,
      change: null,
      icon: DollarSign,
      color: 'green',
    },
    {
      label: 'Annual Recurring Revenue',
      value: `$${(stats?.totalARR || 0).toLocaleString()}`,
      change: null,
      icon: TrendingUp,
      color: 'blue',
    },
    {
      label: 'Active Subscriptions',
      value: stats?.activeSubscriptions || 0,
      change: null,
      icon: Users,
      color: 'purple',
    },
    {
      label: 'Trial Subscriptions',
      value: stats?.trialSubscriptions || 0,
      change: null,
      icon: Activity,
      color: 'orange',
    },
    {
      label: 'Churn Rate',
      value: `${stats?.churnRate || 0}%`,
      change: null,
      icon: AlertCircle,
      color: 'red',
      inverse: true,
    },
    {
      label: 'Customer LTV',
      value: `$${(stats?.ltv || 0).toLocaleString()}`,
      change: null,
      icon: CreditCard,
      color: 'indigo',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ios-dark">Billing Analytics</h1>
        <p className="text-ios-secondary mt-1">
          Platform revenue, subscriptions, and growth metrics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const colorClasses: Record<string, string> = {
            green: 'bg-apple-green/20 text-apple-green',
            blue: 'bg-wa-green/20 text-wa-green',
            purple: 'bg-apple-purple/20 text-apple-purple',
            orange: 'bg-apple-orange/20 text-apple-orange',
            red: 'bg-apple-red/20 text-apple-red',
            indigo: 'bg-apple-indigo/20 text-apple-indigo',
          };

          return (
            <div key={card.label} className="card-apple p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-ios-secondary">{card.label}</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">{card.value}</p>
                  <p
                    className={`text-sm mt-1 ${
                      card.inverse
                        ? ((card.change as unknown) as string)?.startsWith('-')
                          ? 'text-apple-green'
                          : 'text-apple-red'
                        : ((card.change as unknown) as string)?.startsWith('+')
                        ? 'text-apple-green'
                        : 'text-apple-red'
                    }`}
                  >
                    {card.change || '0%'} vs last month
                  </p>
                </div>
                <div className={`p-3 rounded-apple-lg ${colorClasses[card.color]}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <div className="card-apple p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-ios-dark">Revenue Growth</h2>
            <p className="text-sm text-ios-muted">Monthly recurring revenue over time</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-wa-green rounded-full" />
              <span className="text-ios-secondary">MRR</span>
            </div>
          </div>
        </div>

        {/* Simple Bar Chart */}
        <div className="space-y-3">
          {revenueData.map((data) => (
            <div key={data.month} className="flex items-center gap-3">
              <span className="w-12 text-sm text-ios-muted">{data.month}</span>
              <div className="flex-1 bg-ios-gray rounded-full h-8 relative overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-wa-green/60 to-wa-green rounded-full flex items-center justify-end px-3 transition-all"
                  style={{ width: `${(data.mrr / maxMRR) * 100}%` }}
                >
                  <span className="text-xs text-white font-medium">
                    ${(data.mrr / 1000).toFixed(1)}k
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <div className="card-apple p-6">
          <h2 className="text-lg font-semibold text-ios-dark mb-4">
            Plan Distribution
          </h2>
          <div className="space-y-4">
            {[
              { tier: 'STARTER', color: 'bg-ios-muted', price: 49 },
              { tier: 'GROWTH', color: 'bg-wa-green', price: 149 },
              { tier: 'BUSINESS', color: 'bg-apple-purple', price: 399 },
              { tier: 'ENTERPRISE', color: 'bg-apple-indigo', price: 0 },
            ].map((plan) => {
              const count = planCounts[plan.tier] || 0;
              const total = tenants.length || 1;
              const percentage = (count / total) * 100;
              const revenue = plan.price * count;

              return (
                <div key={plan.tier}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${plan.color}`} />
                      <span className="font-medium text-ios-dark">{plan.tier}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-ios-muted">{count} tenants</span>
                      <span className="text-sm font-medium text-ios-dark">
                        ${revenue.toLocaleString()}/mo
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-ios-gray rounded-full overflow-hidden">
                    <div
                      className={`h-full ${plan.color} rounded-full transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Customers */}
        <div className="card-apple p-6">
          <h2 className="text-lg font-semibold text-ios-dark mb-4">Top Customers</h2>
          <div className="space-y-3">
            {tenants.slice(0, 5).map((tenant: any) => (
              <div
                key={tenant.id}
                className="flex items-center justify-between p-3 hover:bg-ios-gray rounded-apple-lg transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center font-semibold">
                    {tenant.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-ios-dark">{tenant.name}</p>
                    <p className="text-sm text-ios-muted">{tenant.billingEmail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-ios-dark">{tenant.plan || 'STARTER'}</p>
                  <p className="text-sm text-ios-muted">
                    {tenant.currentMessages?.toLocaleString() || 0} msgs
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="card-apple p-6">
        <h2 className="text-lg font-semibold text-ios-dark mb-4">Recent Billing Events</h2>
        <div className="space-y-3">
          {[
            { type: 'subscription.created', tenant: 'TechStart Inc', amount: '+ $149.00', color: 'green' },
            { type: 'invoice.paid', tenant: 'Global Retail Ltd', amount: '+ $399.00', color: 'green' },
            { type: 'subscription.updated', tenant: 'Acme Corp', amount: 'plan change', color: 'blue' },
            { type: 'invoice.payment_failed', tenant: 'Old Customer', amount: '- $49.00', color: 'red' },
            { type: 'subscription.deleted', tenant: 'Churned Inc', amount: 'canceled', color: 'gray' },
          ].map((event, i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-black/5 rounded-apple-lg">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    event.color === 'green'
                      ? 'bg-apple-green'
                      : event.color === 'red'
                      ? 'bg-apple-red'
                      : event.color === 'blue'
                      ? 'bg-wa-green'
                      : 'bg-ios-muted'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-ios-dark">
                    {event.type}
                  </p>
                  <p className="text-xs text-ios-muted">{event.tenant}</p>
                </div>
              </div>
              <span className="text-sm font-medium text-ios-dark">{event.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
