import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useCurrency, formatMoney } from '../lib/money';
import {
  Building2,
  CreditCard,
  MessageSquare,
  Ticket,
  TrendingUp,
  Users,
  AlertTriangle,
} from 'lucide-react';

interface SuperAdminDashboard {
  totalTenants: number;
  activeTenants: number;
  totalMessages: number;
  totalContacts: number;
  mrr: number;
  openTickets: number;
  trialTenants: number;
}

interface Tenant {
  id: string;
  name: string;
  status: string;
  plan: any;
  planName: string | null;
  trialEndsAt: string | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function SuperAdminDashboard() {
  const fx = useCurrency();
  const { data, isLoading } = useQuery<{ data: SuperAdminDashboard }>({
    queryKey: ['superadmin', 'dashboard'],
    queryFn: async () => {
      const response = await api.get('/superadmin/dashboard');
      return response.data;
    },
  });

  const { data: tenantsData } = useQuery({
    queryKey: ['superadmin', 'tenants-for-dashboard'],
    queryFn: async () => {
      const response = await api.get('/superadmin/tenants', { params: { limit: 100 } });
      return response.data;
    },
  });

  const metrics = data?.data;
  const tenants = tenantsData?.data || [];

  const cards = [
    {
      label: 'Total Tenants',
      value: metrics?.totalTenants || 0,
      icon: Building2,
      color: 'blue',
      subtext: `${metrics?.activeTenants || 0} active`,
    },
    {
      label: 'Monthly Revenue',
      value: formatMoney(Number(metrics?.mrr || 0), fx, { decimals: 0 }),
      icon: CreditCard,
      color: 'green',
      subtext: 'MRR',
    },
    {
      label: 'Total Messages',
      value: formatCount(metrics?.totalMessages || 0),
      icon: MessageSquare,
      color: 'purple',
      subtext: 'All time',
    },
    {
      label: 'Open Tickets',
      value: metrics?.openTickets || 0,
      icon: Ticket,
      color: 'orange',
      subtext: 'Need attention',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ios-dark">Platform Dashboard</h1>
        <p className="text-ios-secondary mt-1">
          Overview of your WhatsApp SaaS platform
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="card-apple p-5 hover:shadow-apple-hover transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-ios-secondary">{card.label}</p>
                <p className="text-2xl font-bold text-ios-dark mt-1">
                  {isLoading ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    card.value
                  )}
                </p>
                <p className="text-sm text-ios-muted mt-1">{card.subtext}</p>
              </div>
              <div
                className={`p-3 rounded-apple-lg ${
                  card.color === 'blue' && 'bg-wa-green/20 text-wa-green'
                } ${card.color === 'green' && 'bg-wa-green/20 text-wa-green'}
                   ${card.color === 'purple' && 'bg-wa-teal/20 text-wa-teal'}
                   ${card.color === 'orange' && 'bg-wa-teal/20 text-wa-teal'}`}
              >
                <card.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trial Tenants Alert */}
        <div className="card-apple p-6">
          <h2 className="text-lg font-semibold text-ios-dark flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-apple-orange" />
            Trials Ending Soon
          </h2>
          <div className="space-y-3">
            {tenants
              .filter((t: Tenant) => t.status === 'TRIAL' && t.trialEndsAt)
              .sort((a: Tenant, b: Tenant) =>
                new Date(a.trialEndsAt!).getTime() - new Date(b.trialEndsAt!).getTime()
              )
              .slice(0, 5)
              .map((tenant: Tenant) => {
                const daysLeft = Math.ceil(
                  (new Date(tenant.trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div key={tenant.id} className="flex items-center justify-between p-3 bg-apple-orange/10 rounded-apple-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-apple-orange/20 text-apple-orange rounded-apple-lg flex items-center justify-center">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-ios-dark">{tenant.name}</p>
                        <p className="text-xs text-ios-muted">{tenant.planName || 'No plan'}</p>
                      </div>
                    </div>
                    <span className="text-sm text-apple-orange font-medium">
                      {daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}
                    </span>
                  </div>
                );
              })}
            {tenants.filter((t: Tenant) => t.status === 'TRIAL').length === 0 && (
              <p className="text-sm text-ios-muted">No trials ending soon</p>
            )}
          </div>
        </div>

        {/* Platform Health */}
        <div className="card-apple p-6">
          <h2 className="text-lg font-semibold text-ios-dark flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-wa-green" />
            Platform Health
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-ios-secondary">API Uptime</span>
              <span className="font-medium text-wa-green">99.9%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ios-secondary">Database</span>
              <span className="font-medium text-wa-green">Healthy</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ios-secondary">Message Delivery</span>
              <span className="font-medium text-wa-green">98.2%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ios-secondary">Avg Response Time</span>
              <span className="font-medium text-ios-dark">45ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tenants */}
      <div className="card-apple p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ios-dark">Recent Tenants</h2>
          <a href="/superadmin/tenants" className="text-wa-green hover:text-wa-teal text-sm">
            View all →
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tenants.slice(0, 6).map((tenant: Tenant) => (
            <div key={tenant.id} className="p-4 bg-ios-gray rounded-apple-lg hover:bg-ios-gray/80 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center font-semibold">
                  {tenant.name.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-ios-dark">{tenant.name}</p>
                  <p className="text-sm text-ios-muted">{tenant.plan?.name || 'No plan'}</p>
                </div>
              </div>
              <span
                className={`px-2 py-1 text-xs rounded-apple-full ${
                  tenant.status === 'ACTIVE'
                    ? 'bg-wa-green/20 text-wa-green'
                    : tenant.status === 'TRIAL'
                    ? 'bg-wa-teal/20 text-wa-teal'
                    : tenant.status === 'SUSPENDED'
                    ? 'bg-red-500/20 text-red-500'
                    : 'bg-ios-gray text-ios-secondary'
                }`}
              >
                {tenant.status === 'TRIAL' ? 'Trial' : tenant.status === 'SUSPENDED' ? 'Suspended' : tenant.status.charAt(0) + tenant.status.slice(1).toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
