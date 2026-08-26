/**
 * SuperAdmin Credits Management — Platform-wide credit oversight with multi-currency
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Coins,
  Search,
  Filter,
  Plus,
  Minus,
  ArrowUpDown,
  X,
  Loader2,
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Globe,
  Download,
} from 'lucide-react';

type TabType = 'overview' | 'tenants' | 'adjustments' | 'rates';

interface TenantCredit {
  id: string;
  name: string;
  plan: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  lastTopup: string;
  status: 'active' | 'low' | 'depleted';
  billingEmail: string;
}

interface Adjustment {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  reason: string;
  admin: string;
  createdAt: string;
}

export default function SuperAdminCreditsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [search, setSearch] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantCredit | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');

  const queryClient = useQueryClient();

  const { data: creditStatsData } = useQuery({
    queryKey: ['superadmin', 'credits', 'stats'],
    queryFn: async () => {
      const response = await api.get('/superadmin/credit-stats');
      return response.data;
    },
  });

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['superadmin', 'credits', 'tenants'],
    queryFn: async () => {
      // Fetch all tenants and their credit info
      const response = await api.get('/superadmin/tenants', { params: { limit: 50 } });
      const tenants = response.data.data || [];
      // Get credit info for each tenant
      const tenantsWithCredits = await Promise.all(
        tenants.map(async (t: any) => {
          try {
            const creditRes = await api.get(`/superadmin/tenants/${t.id}/credits`);
            return {
              ...t,
              balance: creditRes.data.data?.credits?.balance || 0,
              totalPurchased: creditRes.data.data?.credits?.totalPurchased || 0,
              totalUsed: creditRes.data.data?.credits?.totalUsed || 0,
            };
          } catch {
            return { ...t, balance: 0, totalPurchased: 0, totalUsed: 0 };
          }
        })
      );
      return { data: tenantsWithCredits };
    },
  });

  const { data: adjustmentsData } = useQuery({
    queryKey: ['superadmin', 'credits', 'transactions'],
    queryFn: async () => {
      // Get recent credit transactions from all tenants
      const response = await api.get('/superadmin/audit-logs', { params: { action: 'CREDIT_ADDED,CREDIT_DEDUCTED' } });
      return response.data;
    },
    enabled: activeTab === 'adjustments',
  });

  const adjustmentMutation = useMutation({
    mutationFn: async (data: { tenantId: string; amount: number; reason: string; type: string }) => {
      if (data.type === 'add') {
        const response = await api.post(`/superadmin/tenants/${data.tenantId}/credits`, {
          amount: data.amount,
          type: 'BONUS',
          description: data.reason,
        });
        return response.data;
      } else {
        const response = await api.post(`/superadmin/tenants/${data.tenantId}/credits/deduct`, {
          amount: data.amount,
          description: data.reason,
        });
        return response.data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'credits'] });
      setShowAdjustModal(false);
      setSelectedTenant(null);
      setAdjustAmount('');
      setAdjustReason('');
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get('/superadmin/credits/export', { responseType: 'blob' });
      return response.data;
    },
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `credits-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    },
  });

  // Real data from API
  const tenants: TenantCredit[] = (tenantsData?.data || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    plan: t.plan?.tier || t.planName || 'No Plan',
    balance: t.balance || 0,
    totalPurchased: t.totalPurchased || 0,
    totalUsed: t.totalUsed || 0,
    lastTopup: t.updatedAt || new Date().toISOString(),
    status: (t.balance || 0) > 1000 ? 'active' : (t.balance || 0) > 0 ? 'low' : 'depleted',
    billingEmail: t.billingEmail || '—',
  }));

  const adjustments: Adjustment[] = (adjustmentsData?.data || []).map((log: any) => ({
    id: log.id,
    tenantId: log.tenantId || '',
    tenantName: log.tenant?.name || 'Unknown',
    amount: log.metadata?.amount || 0,
    reason: log.description || log.metadata?.reason || 'No description',
    admin: 'admin',
    createdAt: log.createdAt,
  }));

  const filteredTenants = tenants.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.billingEmail.toLowerCase().includes(search.toLowerCase())
  );

  const totalPlatformBalance = tenants.reduce((sum, t) => sum + t.balance, 0);
  const totalPurchased = tenants.reduce((sum, t) => sum + t.totalPurchased, 0);
  const totalUsed = tenants.reduce((sum, t) => sum + t.totalUsed, 0);
  const lowBalance = tenants.filter(t => t.status === 'low' || t.status === 'depleted');

  const openAdjustModal = (tenant: TenantCredit) => {
    setSelectedTenant(tenant);
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustType('add');
    setShowAdjustModal(true);
  };

  const handleAdjust = () => {
    if (!selectedTenant || !adjustAmount || !adjustReason) return;
    adjustmentMutation.mutate({
      tenantId: selectedTenant.id,
      amount: parseInt(adjustAmount),
      reason: adjustReason,
      type: adjustType,
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-wa-green/20 text-wa-green';
      case 'low': return 'bg-apple-orange/20 text-apple-orange';
      case 'depleted': return 'bg-red-500/20 text-red-500';
      default: return 'bg-ios-gray text-ios-muted';
    }
  };

  const formatCredits = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Credits Management</h1>
          <p className="text-ios-secondary mt-1">
            Platform-wide credit oversight and adjustments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportMutation.mutate()}
            className="btn-apple btn-apple-outline flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-ios-gray p-1 rounded-apple-lg w-fit">
        {(['overview', 'tenants', 'adjustments', 'rates'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-apple transition capitalize ${
              activeTab === tab ? 'bg-white shadow-sm text-ios-dark' : 'text-ios-secondary hover:text-ios-dark'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card-apple p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-wa-green/20 text-wa-green rounded-apple-xl flex items-center justify-center">
                  <Coins className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-ios-secondary">Total Platform Balance</p>
                  <p className="text-2xl font-bold text-ios-dark">{formatCredits(totalPlatformBalance)}</p>
                  <p className="text-xs text-ios-muted">~${(totalPlatformBalance / 10000).toFixed(2)} USD</p>
                </div>
              </div>
            </div>

            <div className="card-apple p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-wa-green/20 text-wa-green rounded-apple-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-ios-secondary">Total Purchased</p>
                  <p className="text-2xl font-bold text-ios-dark">{formatCredits(totalPurchased)}</p>
                  <p className="text-xs text-ios-muted">All time</p>
                </div>
              </div>
            </div>

            <div className="card-apple p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-apple-xl flex items-center justify-center">
                  <TrendingDown className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-ios-secondary">Total Used</p>
                  <p className="text-2xl font-bold text-ios-dark">{formatCredits(totalUsed)}</p>
                  <p className="text-xs text-ios-muted">All time</p>
                </div>
              </div>
            </div>

            <div className="card-apple p-5">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 ${lowBalance.length > 0 ? 'bg-apple-orange/20 text-apple-orange' : 'bg-ios-gray text-ios-muted'} rounded-apple-xl flex items-center justify-center`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-ios-secondary">Low Balance</p>
                  <p className="text-2xl font-bold text-ios-dark">{lowBalance.length}</p>
                  <p className="text-xs text-ios-muted">tenants need attention</p>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Distribution */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { plan: 'STARTER', count: tenants.filter(t => t.plan === 'STARTER').length, color: 'bg-ios-muted', credits: tenants.filter(t => t.plan === 'STARTER').reduce((s, t) => s + t.balance, 0) },
              { plan: 'GROWTH', count: tenants.filter(t => t.plan === 'GROWTH').length, color: 'bg-wa-green', credits: tenants.filter(t => t.plan === 'GROWTH').reduce((s, t) => s + t.balance, 0) },
              { plan: 'BUSINESS', count: tenants.filter(t => t.plan === 'BUSINESS').length, color: 'bg-apple-purple', credits: tenants.filter(t => t.plan === 'BUSINESS').reduce((s, t) => s + t.balance, 0) },
              { plan: 'ENTERPRISE', count: tenants.filter(t => t.plan === 'ENTERPRISE').length, color: 'bg-apple-indigo', credits: tenants.filter(t => t.plan === 'ENTERPRISE').reduce((s, t) => s + t.balance, 0) },
            ].map((p) => (
              <div key={p.plan} className="card-apple p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-3 h-3 rounded-full ${p.color}`} />
                  <span className="font-medium text-ios-dark text-sm">{p.plan}</span>
                  <span className="text-xs text-ios-muted ml-auto">{p.count} tenants</span>
                </div>
                <p className="text-lg font-bold text-ios-dark">{formatCredits(p.credits)}</p>
                <p className="text-xs text-ios-muted">credits balance</p>
              </div>
            ))}
          </div>

          {/* Recent Adjustments */}
          <div className="card-apple p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ios-dark">Recent Adjustments</h2>
              <button
                onClick={() => setActiveTab('adjustments')}
                className="text-sm text-wa-green hover:underline"
              >
                View all
              </button>
            </div>
            <div className="space-y-3">
              {adjustments.slice(0, 4).map((adj) => (
                <div key={adj.id} className="flex items-center justify-between p-3 border border-black/5 rounded-apple-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${adj.amount > 0 ? 'bg-wa-green/20 text-wa-green' : 'bg-red-500/20 text-red-500'} rounded-apple-lg flex items-center justify-center`}>
                      {adj.amount > 0 ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ios-dark">{adj.tenantName}</p>
                      <p className="text-xs text-ios-muted">{adj.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${adj.amount > 0 ? 'text-wa-green' : 'text-red-500'}`}>
                      {adj.amount > 0 ? '+' : ''}{formatCredits(adj.amount)}
                    </p>
                    <p className="text-xs text-ios-muted">{new Date(adj.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tenants Tab */}
      {activeTab === 'tenants' && (
        <div className="space-y-4">
          {/* Search + Filters */}
          <div className="card-apple p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tenants by name or email..."
                  className="input-apple w-full pl-10"
                />
              </div>
              <select className="input-apple w-auto">
                <option value="">All Plans</option>
                <option value="STARTER">STARTER</option>
                <option value="GROWTH">GROWTH</option>
                <option value="BUSINESS">BUSINESS</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
              <select className="input-apple w-auto">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="low">Low Balance</option>
                <option value="depleted">Depleted</option>
              </select>
            </div>
          </div>

          {/* Tenant Table */}
          <div className="card-apple overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ios-gray">
                    {['Tenant', 'Plan', 'Balance', 'Purchased', 'Used', 'Last Top-up', 'Status', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-ios-secondary font-medium text-xs whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredTenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-ios-gray/50 transition">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-ios-dark">{tenant.name}</p>
                          <p className="text-xs text-ios-muted">{tenant.billingEmail}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-apple font-medium ${
                          tenant.plan === 'ENTERPRISE' ? 'bg-apple-indigo/20 text-apple-indigo' :
                          tenant.plan === 'BUSINESS' ? 'bg-apple-purple/20 text-apple-purple' :
                          tenant.plan === 'GROWTH' ? 'bg-wa-green/20 text-wa-green' :
                          'bg-ios-gray text-ios-secondary'
                        }`}>
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-ios-dark">{formatCredits(tenant.balance)}</span>
                      </td>
                      <td className="px-4 py-3 text-ios-secondary">{formatCredits(tenant.totalPurchased)}</td>
                      <td className="px-4 py-3 text-ios-secondary">{formatCredits(tenant.totalUsed)}</td>
                      <td className="px-4 py-3 text-ios-muted text-xs">{new Date(tenant.lastTopup).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-apple-full font-medium ${statusColor(tenant.status)}`}>
                          {tenant.status === 'low' ? 'Low' : tenant.status === 'depleted' ? 'Depleted' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openAdjustModal(tenant)}
                          className="btn-apple btn-apple-outline text-xs py-1.5"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Adjustments Tab */}
      {activeTab === 'adjustments' && (
        <div className="card-apple p-6">
          <h2 className="text-lg font-semibold text-ios-dark mb-4">Credit Adjustments Log</h2>
          <div className="space-y-3">
            {adjustments.map((adj) => (
              <div key={adj.id} className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg hover:bg-ios-gray/50 transition">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${adj.amount > 0 ? 'bg-wa-green/20 text-wa-green' : 'bg-red-500/20 text-red-500'} rounded-apple-lg flex items-center justify-center`}>
                    {adj.amount > 0 ? <Plus className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-ios-dark">{adj.tenantName}</p>
                    <p className="text-sm text-ios-secondary">{adj.reason}</p>
                    <p className="text-xs text-ios-muted mt-1">
                      by {adj.admin} · {new Date(adj.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className={`text-xl font-bold ${adj.amount > 0 ? 'text-wa-green' : 'text-red-500'}`}>
                  {adj.amount > 0 ? '+' : ''}{formatCredits(adj.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rates Tab */}
      {activeTab === 'rates' && (
        <div className="space-y-4">
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-ios-muted" />
              Platform-Wide Rate Configuration
            </h2>
            <div className="bg-wa-green/10 border border-wa-green/20 rounded-apple-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-wa-green flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ios-secondary">
                Rate management is per-tenant based on their Meta Business API contract. Platform rates reflect Meta's official WhatsApp Business API pricing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {[
              { category: 'Marketing', rate: '$0.05–$0.60', color: 'red-500', note: 'Per message (varies by country)' },
              { category: 'Utility', rate: '$0.02–$0.12', color: 'wa-green', note: 'Per message (varies by country)' },
              { category: 'Authentication', rate: '$0.01–$0.06', color: 'wa-green', note: 'Per message (varies by country)' },
              { category: 'Session Reply', rate: 'FREE', color: 'apple-purple', note: 'Within 24h customer window' },
            ].map((r) => (
              <div key={r.category} className="card-apple p-5">
                <p className={`text-lg font-bold text-${r.color}`}>{r.category}</p>
                <p className="text-2xl font-bold text-ios-dark mt-2">{r.rate}</p>
                <p className="text-xs text-ios-muted mt-2">{r.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjustModal && selectedTenant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">Adjust Credits</h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="p-1 hover:bg-ios-gray rounded-apple-lg"
              >
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-ios-gray rounded-apple-lg">
              <p className="font-medium text-ios-dark">{selectedTenant.name}</p>
              <p className="text-sm text-ios-muted">Current balance: <span className="font-bold text-ios-dark">{formatCredits(selectedTenant.balance)}</span></p>
            </div>

            {/* Add / Deduct Toggle */}
            <div className="flex gap-2 mb-5">
              {(['add', 'deduct'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setAdjustType(type)}
                  className={`flex-1 py-2.5 rounded-apple-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
                    adjustType === type
                      ? type === 'add'
                        ? 'bg-wa-green text-white'
                        : 'bg-red-500 text-white'
                      : 'bg-ios-gray text-ios-secondary'
                  }`}
                >
                  {type === 'add' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  {type === 'add' ? 'Add Credits' : 'Deduct Credits'}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">
                  Amount
                </label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="input-apple w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">
                  Reason (required)
                </label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Reason for adjustment..."
                  rows={3}
                  className="input-apple w-full resize-none"
                />
              </div>

              <button
                onClick={handleAdjust}
                disabled={adjustmentMutation.isPending || !adjustAmount || !adjustReason}
                className={`w-full py-3 rounded-apple-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 ${
                  adjustType === 'add'
                    ? 'bg-wa-green text-white hover:bg-wa-green/90'
                    : 'bg-red-500 text-white hover:bg-red-500/90'
                }`}
              >
                {adjustmentMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {adjustmentMutation.isPending ? 'Processing...' : `${adjustType === 'add' ? 'Add' : 'Deduct'} ${adjustAmount ? parseInt(adjustAmount).toLocaleString() : 0} Credits`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
