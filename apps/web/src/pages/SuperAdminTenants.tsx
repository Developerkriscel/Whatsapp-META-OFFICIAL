import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Building2, Search, Plus, X, Ban, CheckCircle, Users, CreditCard,
  Settings, ChevronDown, Shield, Coins, Copy, Check, Phone,
  FileText, Send, MessageSquare, UserCheck, ArrowUp, ArrowDown,
  TrendingDown, Zap, Eye, EyeOff, Minus
} from 'lucide-react';

interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface TenantCreditInfo {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  transactions: CreditTransaction[];
}

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  balanceAfter: number;
  createdAt: string;
}

export default function SuperAdminTenantsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['superadmin-tenants', page, debouncedSearch, status],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (status) params.status = status;
      const response = await api.get('/superadmin/tenants', { params });
      return response.data;
    },
  });

  const tenants = tenantsData?.data || [];
  const meta = tenantsData?.meta || { total: 0 };
  const total = meta.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Tenants</h1>
          <p className="text-ios-secondary mt-1">{total} total tenants</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-apple btn-wa-green flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Tenant
        </button>
      </div>

      {/* Add Tenant Modal */}
      {showAddModal && (
        <AddTenantModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(data) => {
            queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] });
            setShowAddModal(false);
            setSelectedTenantId(data.id);
          }}
        />
      )}

      <div className="card-apple">
        {/* Filters */}
        <div className="p-4 border-b border-black/5 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenants..."
              className="input-apple w-full pl-10"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input-apple text-sm"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="TRIAL">Trial</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        {/* Table */}
        <table className="w-full">
          <thead className="bg-ios-gray">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-ios-muted uppercase tracking-wider">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ios-muted uppercase tracking-wider">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ios-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ios-muted uppercase tracking-wider">Contacts</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ios-muted uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-ios-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ios-muted">Loading tenants...</td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ios-secondary">No tenants found</td>
              </tr>
            ) : (
              tenants.map((t: any) => (
                <tr key={t.id} className="hover:bg-ios-gray/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center font-semibold text-sm">
                        {t.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-ios-dark">{t.name}</p>
                        <p className="text-xs text-ios-muted">{t.billingEmail || t.website || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-ios-secondary">{t.plan?.name || t.planName || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-apple-full font-medium ${
                      t.status === 'ACTIVE' ? 'bg-wa-green/20 text-wa-green' :
                      t.status === 'TRIAL' ? 'bg-wa-green/20 text-wa-green' :
                      t.status === 'SUSPENDED' ? 'bg-red-500/20 text-red-500' :
                      'bg-ios-gray text-ios-secondary'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ios-secondary">
                    {(t.currentContacts || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-ios-muted">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedTenantId(t.id)}
                      className="btn-apple btn-apple-outline text-sm py-1.5"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ios-secondary">
          Page {page} of {Math.max(1, Math.ceil(total / 20))}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-apple btn-apple-outline text-sm py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * 20 >= total}
            className="btn-apple btn-apple-outline text-sm py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Tenant Detail Modal */}
      {selectedTenantId && (
        <TenantDetailModal
          tenantId={selectedTenantId}
          onClose={() => setSelectedTenantId(null)}
        />
      )}
    </div>
  );
}

// ============================================
// Tenant Detail Modal
// ============================================

interface TenantDetailModalProps {
  tenantId: string;
  onClose: () => void;
}

function TenantDetailModal({ tenantId, onClose }: TenantDetailModalProps) {
  const [tab, setTab] = useState<'overview' | 'users' | 'credits' | 'billing'>('overview');
  const queryClient = useQueryClient();

  const { data: tenantData, isLoading } = useQuery({
    queryKey: ['superadmin-tenant-detail', tenantId],
    queryFn: async () => {
      const r = await api.get(`/superadmin/tenants/${tenantId}`);
      return r.data.data;
    },
    enabled: !!tenantId,
  });

  const updateMutation = useMutation({
    mutationFn: async (body: any) => {
      await api.patch(`/superadmin/tenants/${tenantId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenant-detail', tenantId] });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/superadmin/tenants/${tenantId}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenant-detail', tenantId] });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/superadmin/tenants/${tenantId}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenant-detail', tenantId] });
    },
  });

  if (isLoading) {
    return createPortal(
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999]">
        <div className="glass-card rounded-apple-xl p-12">Loading...</div>
      </div>,
      document.body
    );
  }

  if (!tenantData) return null;

  const tenant = tenantData;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-apple-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-black/10 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center font-bold">
              {tenant.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="font-semibold text-lg text-ios-dark">{tenant.name}</h3>
              <p className="text-xs text-ios-muted">{tenant.billingEmail || 'No billing email'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs rounded-apple-full font-medium ${
              tenant.status === 'ACTIVE' ? 'bg-wa-green/20 text-wa-green' :
              tenant.status === 'TRIAL' ? 'bg-wa-green/20 text-wa-green' :
              tenant.status === 'SUSPENDED' ? 'bg-red-500/20 text-red-500' : 'bg-ios-gray text-ios-secondary'
            }`}>
              {tenant.status}
            </span>
            {tenant.status === 'ACTIVE' || tenant.status === 'TRIAL' ? (
              <button
                onClick={() => suspendMutation.mutate()}
                disabled={suspendMutation.isPending}
                className="px-3 py-1 text-xs border border-red-500/30 text-red-500 rounded-apple-lg hover:bg-red-500/10 disabled:opacity-50"
              >
                Suspend
              </button>
            ) : (
              <button
                onClick={() => reactivateMutation.mutate()}
                disabled={reactivateMutation.isPending}
                className="px-3 py-1 text-xs border border-wa-green/30 text-wa-green rounded-apple-lg hover:bg-wa-green/10 disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
            <button
              onClick={async () => {
                try {
                  const res = await api.post(`/superadmin/tenants/${tenantId}/impersonate`);
                  if (res.data?.data?.accessToken) {
                    localStorage.setItem('accessToken', res.data.data.accessToken);
                    localStorage.setItem('user', JSON.stringify(res.data.data.user));
                    window.location.href = '/dashboard';
                  }
                } catch (err: any) {
                  alert(err.response?.data?.error?.message || 'Failed to impersonate tenant');
                }
              }}
              className="px-3 py-1 text-xs bg-wa-green text-white rounded-apple-lg hover:bg-wa-green/90 font-medium"
            >
              Log in as Tenant
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-ios-gray rounded-apple-lg">
              <X className="w-5 h-5 text-ios-muted" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/5 px-6 flex-shrink-0">
          <button
            onClick={() => setTab('overview')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              tab === 'overview' ? 'border-wa-green text-wa-green' : 'border-transparent text-ios-secondary hover:text-ios-dark'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              tab === 'users' ? 'border-wa-green text-wa-green' : 'border-transparent text-ios-secondary hover:text-ios-dark'
            }`}
          >
            Users ({tenant.users?.length || 0})
          </button>
          <button
            onClick={() => setTab('credits')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              tab === 'credits' ? 'border-wa-green text-wa-green' : 'border-transparent text-ios-secondary hover:text-ios-dark'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Coins className="w-4 h-4" /> Credits
            </span>
          </button>
          <button
            onClick={() => setTab('billing')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              tab === 'billing' ? 'border-wa-green text-wa-green' : 'border-transparent text-ios-secondary hover:text-ios-dark'
            }`}
          >
            Billing
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'overview' && <OverviewTab tenant={tenant} tenantId={tenantId} updateMutation={updateMutation} />}
          {tab === 'users' && <UsersTab tenantId={tenantId} users={tenant.users || []} />}
          {tab === 'credits' && <CreditsTab tenantId={tenantId} tenantName={tenant.name} />}
          {tab === 'billing' && <BillingTab tenantId={tenantId} tenant={tenant} />}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================
// Overview Tab
// ============================================

function OverviewTab({ tenant, tenantId, updateMutation }: { tenant: any; tenantId: string; updateMutation: any }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: tenant.name || '',
    website: tenant.website || '',
    billingEmail: tenant.billingEmail || '',
    industry: tenant.industry || '',
  });

  const { data: statsData } = useQuery({
    queryKey: ['tenant-stats', tenantId],
    queryFn: async () => {
      const r = await api.get(`/superadmin/tenants/${tenantId}/stats`);
      return r.data.data;
    },
    enabled: !!tenantId,
  });

  const handleSave = () => {
    updateMutation.mutate(form, {
      onSuccess: () => setEditing(false),
    });
  };

  const stats = statsData || {};

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-ios-gray rounded-apple-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-ios-muted" />
            <p className="text-xs text-ios-muted">Contacts</p>
          </div>
          <p className="text-xl font-bold text-ios-dark">{(stats.contacts || tenant.currentContacts || 0).toLocaleString()}</p>
        </div>
        <div className="bg-ios-gray rounded-apple-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-ios-muted" />
            <p className="text-xs text-ios-muted">Phone Numbers</p>
          </div>
          <p className="text-xl font-bold text-ios-dark">{stats.phoneNumbers || 0}</p>
        </div>
        <div className="bg-ios-gray rounded-apple-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-ios-muted" />
            <p className="text-xs text-ios-muted">Templates</p>
          </div>
          <p className="text-xl font-bold text-ios-dark">{stats.templates || 0}</p>
        </div>
        <div className="bg-ios-gray rounded-apple-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Send className="w-4 h-4 text-ios-muted" />
            <p className="text-xs text-ios-muted">Campaigns</p>
          </div>
          <p className="text-xl font-bold text-ios-dark">{stats.campaigns || 0}</p>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Tenant Name</label>
          {editing ? (
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-apple mt-1 w-full"
            />
          ) : (
            <p className="mt-1 text-sm font-medium text-ios-dark">{tenant.name}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Plan</label>
          <p className="mt-1 text-sm font-medium text-ios-dark">{tenant.plan?.name || tenant.planName || '—'}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Website</label>
          {editing ? (
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="input-apple mt-1 w-full"
            />
          ) : (
            <p className="mt-1 text-sm text-ios-secondary">{tenant.website || '—'}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Industry</label>
          {editing ? (
            <input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="input-apple mt-1 w-full"
            />
          ) : (
            <p className="mt-1 text-sm text-ios-secondary">{tenant.industry || '—'}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Billing Email</label>
          {editing ? (
            <input
              value={form.billingEmail}
              onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
              className="input-apple mt-1 w-full"
            />
          ) : (
            <p className="mt-1 text-sm text-ios-secondary">{tenant.billingEmail || '—'}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Quality Score</label>
          <p className="mt-1 text-sm text-ios-secondary">{tenant.qualityScore || '—'}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Messages Sent</label>
          <p className="mt-1 text-sm text-ios-secondary">{(stats.messages || tenant.currentMessages || 0).toLocaleString()}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ios-muted uppercase tracking-wider">Created</label>
          <p className="mt-1 text-sm text-ios-secondary">
            {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="btn-apple bg-wa-gradient disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="btn-apple btn-apple-outline"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="btn-apple btn-apple-outline"
          >
            Edit Details
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Users Tab
// ============================================

function UsersTab({ tenantId, users }: { tenantId: string; users: TenantUser[] }) {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('ADMIN');
  const [inviteName, setInviteName] = useState('');
  const [inviteResult, setInviteResult] = useState<{ user: any; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; role: string }) => {
      const response = await api.post(`/superadmin/tenants/${tenantId}/users`, data);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenant-detail', tenantId] });
      setInviteResult(data);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('ADMIN');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/superadmin/tenants/${tenantId}/users/${userId}/reset-password`, {});
    },
    onSuccess: () => {
      alert('Password reset email sent to user');
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      await api.patch(`/superadmin/tenants/${tenantId}/users/${userId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenant-detail', tenantId] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/superadmin/tenants/${tenantId}/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenant-detail', tenantId] });
    },
  });

  const copyCredentials = () => {
    if (inviteResult) {
      navigator.clipboard.writeText(`Email: ${inviteResult.user.email}\nPassword: ${inviteResult.tempPassword}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const roleColors: Record<string, string> = {
    OWNER: 'bg-apple-purple/20 text-apple-purple',
    ADMIN: 'bg-wa-green/20 text-wa-green',
    MANAGER: 'bg-wa-green/20 text-wa-green',
    AGENT: 'bg-apple-orange/20 text-apple-orange',
    VIEWER: 'bg-ios-gray text-ios-secondary',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ios-secondary">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setShowInvite(true); setInviteResult(null); }}
          className="btn-apple btn-apple-outline border-wa-green text-wa-green text-sm"
        >
          + Add User
        </button>
      </div>

      {/* User Creation Result */}
      {inviteResult && (
        <div className="bg-wa-green/10 border border-wa-green/30 rounded-apple-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-ios-dark flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-wa-green" /> User Created Successfully
              </p>
              <p className="text-sm text-ios-secondary mt-1">Share these credentials with the user:</p>
              <div className="mt-3 bg-white rounded-apple-lg p-3 border border-black/5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-ios-muted">Email</p>
                    <p className="text-sm font-mono font-medium text-ios-dark">{inviteResult.user.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ios-muted">Password</p>
                    <p className="text-sm font-mono font-medium text-ios-dark">{inviteResult.tempPassword}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyCredentials}
                className="px-3 py-1.5 text-xs border border-wa-green/30 text-wa-green rounded-apple-lg hover:bg-wa-green/10 transition flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => setInviteResult(null)}
                className="px-3 py-1.5 text-xs border border-black/10 rounded-apple-lg hover:bg-ios-gray transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <div className="text-center py-8 text-ios-muted">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No users yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 bg-ios-gray rounded-apple-lg hover:bg-ios-gray/80 transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-semibold text-sm">
                  {u.name?.charAt(0)?.toUpperCase() || u.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-ios-dark">{u.name || '—'}</p>
                  <p className="text-xs text-ios-muted">{u.email}</p>
                  {u.lastLoginAt && (
                    <p className="text-xs text-ios-muted">Last login: {new Date(u.lastLoginAt).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs rounded-apple-full font-medium ${roleColors[u.role] || 'bg-ios-gray text-ios-secondary'}`}>
                  {u.role}
                </span>
                <span className={`text-xs ${u.isActive ? 'text-wa-green' : 'text-ios-muted'}`}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => resetPasswordMutation.mutate(u.id)}
                  disabled={resetPasswordMutation.isPending}
                  className="px-2 py-1 text-xs border border-black/10 rounded hover:bg-white transition"
                  title="Reset password"
                >
                  Reset PW
                </button>
                <button
                  onClick={() => toggleUserMutation.mutate({ userId: u.id, isActive: !u.isActive })}
                  disabled={toggleUserMutation.isPending}
                  className={`px-2 py-1 text-xs border rounded transition ${
                    u.isActive ? 'border-red-500/30 text-red-500 hover:bg-red-500/10' : 'border-wa-green/30 text-wa-green hover:bg-wa-green/10'
                  }`}
                >
                  {u.isActive ? 'Deactivate' : 'Activate'}
                </button>
                {u.role !== 'OWNER' && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this user?')) {
                        deleteUserMutation.mutate(u.id);
                      }
                    }}
                    disabled={deleteUserMutation.isPending}
                    className="px-2 py-1 text-xs border border-red-500/30 text-red-500 rounded hover:bg-red-500/10 transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add User Form */}
      {showInvite && (
        <div className="border border-black/5 rounded-apple-lg p-4 bg-ios-gray space-y-3">
          <h4 className="font-medium text-sm text-ios-dark">Add New User</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ios-muted">Full Name *</label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="John Doe"
                className="input-apple w-full mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-ios-muted">Email *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="john@company.com"
                className="input-apple w-full mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-ios-muted">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="input-apple w-full mt-1"
            >
              <option value="ADMIN">Admin - Full access</option>
              <option value="MANAGER">Manager - Manage team & campaigns</option>
              <option value="AGENT">Agent - Handle conversations</option>
              <option value="VIEWER">Viewer - Read only access</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => inviteMutation.mutate({ email: inviteEmail, name: inviteName, role: inviteRole })}
              disabled={!inviteEmail || !inviteName || inviteMutation.isPending}
              className="btn-apple bg-wa-gradient flex items-center gap-2 disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              {inviteMutation.isPending ? 'Creating...' : 'Create User & Generate Credentials'}
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="btn-apple btn-apple-outline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Credits Tab
// ============================================

function CreditsTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<any>(null);

  const { data: creditsData, isLoading } = useQuery({
    queryKey: ['tenant-credits', tenantId],
    queryFn: async () => {
      const r = await api.get(`/superadmin/tenants/${tenantId}/credits`);
      return r.data.data;
    },
    enabled: !!tenantId,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const amt = parseInt(amount);
      if (mode === 'add') {
        const r = await api.post(`/superadmin/tenants/${tenantId}/credits`, {
          amount: amt,
          type: 'BONUS',
          description: description || 'Admin bonus',
        });
        return r.data.data;
      } else {
        const r = await api.post(`/superadmin/tenants/${tenantId}/credits/deduct`, {
          amount: amt,
          description: description || 'Admin deduction',
        });
        return r.data.data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-credits', tenantId] });
      setResultData({
        type: mode,
        amount: parseInt(amount),
        newBalance: data?.balanceAfter || 0,
      });
      setShowResult(true);
      setAmount('');
      setDescription('');
      setTimeout(() => setShowResult(false), 3000);
    },
  });

  if (isLoading) {
    return <div className="text-center py-12 text-ios-muted">Loading credits...</div>;
  }

  const credits = creditsData?.credits || { balance: 0, totalPurchased: 0, totalUsed: 0 };
  const transactions: CreditTransaction[] = creditsData?.transactions || [];

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'PURCHASE': return { color: 'text-wa-green', bg: 'bg-wa-green/20', icon: ArrowUp };
      case 'USAGE': return { color: 'text-red-500', bg: 'bg-red-500/20', icon: ArrowDown };
      case 'REFUND': return { color: 'text-wa-green', bg: 'bg-wa-green/20', icon: ArrowUp };
      case 'BONUS': return { color: 'text-apple-purple', bg: 'bg-apple-purple/20', icon: Zap };
      case 'ADJUSTMENT': return { color: 'text-wa-green', bg: 'bg-wa-green/20', icon: TrendingDown };
      default: return { color: 'text-ios-secondary', bg: 'bg-ios-gray', icon: Coins };
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {showResult && resultData && (
        <div className={`p-4 rounded-apple-lg border ${resultData.type === 'add' ? 'bg-wa-green/10 border-wa-green/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <p className={`font-medium ${resultData.type === 'add' ? 'text-wa-green' : 'text-red-500'}`}>
            {resultData.type === 'add' ? '+' : '-'}{resultData.amount.toLocaleString()} credits {resultData.type === 'add' ? 'added' : 'deducted'}
          </p>
          <p className={`text-sm ${resultData.type === 'add' ? 'text-wa-green/70' : 'text-red-500/70'}`}>
            New balance: {resultData.newBalance.toLocaleString()} credits
          </p>
        </div>
      )}

      {/* Credit Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-wa-green/10 border border-wa-green/20 rounded-apple-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Current Balance</p>
              <p className="text-2xl font-bold text-ios-dark">{credits.balance.toLocaleString()}</p>
              <p className="text-xs text-ios-muted">${(credits.balance / 100).toFixed(2)} USD</p>
            </div>
          </div>
        </div>
        <div className="bg-wa-green/10 border border-wa-green/20 rounded-apple-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center">
              <ArrowUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Total Purchased</p>
              <p className="text-2xl font-bold text-ios-dark">{credits.totalPurchased.toLocaleString()}</p>
              <p className="text-xs text-ios-muted">${(credits.totalPurchased / 100).toFixed(2)} USD</p>
            </div>
          </div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-apple-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 text-red-500 rounded-apple-lg flex items-center justify-center">
              <ArrowDown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Total Used</p>
              <p className="text-2xl font-bold text-ios-dark">{credits.totalUsed.toLocaleString()}</p>
              <p className="text-xs text-ios-muted">${(credits.totalUsed / 100).toFixed(2)} USD</p>
            </div>
          </div>
        </div>
      </div>

      {/* Adjust Credits */}
      <div className="bg-apple-orange/10 border border-apple-orange/20 rounded-apple-xl p-6">
        <h4 className="font-semibold text-ios-dark mb-4">Adjust Credits for {tenantName}</h4>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('add')}
            className={`flex-1 py-2.5 rounded-apple-lg flex items-center justify-center gap-2 font-medium transition ${
              mode === 'add' ? 'bg-wa-green text-white' : 'bg-white border border-black/10 text-ios-secondary hover:bg-wa-green/10'
            }`}
          >
            <Plus className="w-4 h-4" /> Add Credits
          </button>
          <button
            onClick={() => setMode('deduct')}
            className={`flex-1 py-2.5 rounded-apple-lg flex items-center justify-center gap-2 font-medium transition ${
              mode === 'deduct' ? 'bg-red-500 text-white' : 'bg-white border border-black/10 text-ios-secondary hover:bg-red-500/10'
            }`}
          >
            <Minus className="w-4 h-4" /> Deduct Credits
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ios-muted">Amount (credits)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 1000"
              className="input-apple w-full mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-muted">Description / Reason</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Promotional bonus"
              className="input-apple w-full mt-1"
            />
          </div>
        </div>
        <button
          onClick={() => adjustMutation.mutate()}
          disabled={adjustMutation.isPending || !amount || parseInt(amount) <= 0}
          className={`w-full mt-4 py-2.5 rounded-apple-lg text-white font-medium disabled:opacity-50 transition flex items-center justify-center gap-2 ${
            mode === 'add' ? 'bg-wa-green hover:bg-wa-green/90' : 'bg-red-500 hover:bg-red-500/90'
          }`}
        >
          {adjustMutation.isPending ? 'Processing...' : mode === 'add' ? 'Add Credits' : 'Deduct Credits'}
        </button>
      </div>

      {/* Transaction History */}
      <div className="bg-white border border-black/5 rounded-apple-xl">
        <div className="p-4 border-b border-black/5">
          <h4 className="font-semibold text-ios-dark">Recent Transactions</h4>
        </div>
        <div className="divide-y divide-black/5 max-h-64 overflow-y-auto">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-ios-muted">
              <Coins className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No transactions yet</p>
            </div>
          ) : (
            transactions.map((tx) => {
              const style = getTypeStyle(tx.type);
              const Icon = style.icon;
              return (
                <div key={tx.id} className="flex items-center justify-between p-3 hover:bg-ios-gray/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${style.bg} ${style.color} rounded-apple-lg flex items-center justify-center`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ios-dark">{tx.type}</p>
                      <p className="text-xs text-ios-muted">{tx.description || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${tx.amount >= 0 ? 'text-wa-green' : 'text-red-500'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-ios-muted">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Billing Tab
// ============================================

function BillingTab({ tenantId, tenant }: { tenantId: string; tenant: any }) {
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const { data: plansData } = useQuery({
    queryKey: ['superadmin-plans'],
    queryFn: async () => {
      const r = await api.get('/superadmin/plans');
      return r.data.data;
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      await api.patch(`/superadmin/tenants/${tenantId}`, { planId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenant-detail', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] });
      setSelectedPlanId('');
      alert('Plan changed successfully');
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['tenant-stats', tenantId],
    queryFn: async () => {
      const r = await api.get(`/superadmin/tenants/${tenantId}/stats`);
      return r.data.data;
    },
    enabled: !!tenantId,
  });

  const plans = plansData || [];
  const stats = statsData || {};

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-wa-green/10 to-wa-green/20 border border-wa-green/20 rounded-apple-xl p-6">
          <p className="text-xs font-medium text-wa-green uppercase tracking-wider mb-2">Current Plan</p>
          <p className="text-2xl font-bold text-ios-dark">{tenant.plan?.name || tenant.planName || '—'}</p>
          <p className="text-sm text-ios-secondary mt-1">
            {tenant.plan?.monthlyPrice ? `$${tenant.plan.monthlyPrice}/month` : '—'}
          </p>
        </div>
        <div className="bg-gradient-to-br from-apple-purple/10 to-apple-purple/20 border border-apple-purple/20 rounded-apple-xl p-6">
          <p className="text-xs font-medium text-apple-purple uppercase tracking-wider mb-2">Subscription Status</p>
          <p className="text-2xl font-bold text-ios-dark">{tenant.status}</p>
          {tenant.trialEndsAt && (
            <p className="text-sm text-ios-secondary mt-1">
              Trial ends: {new Date(tenant.trialEndsAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Usage Stats */}
      <div>
        <h4 className="text-sm font-semibold text-ios-dark mb-3">Current Usage</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-ios-gray rounded-apple-lg p-4">
            <p className="text-xs text-ios-muted">Contacts</p>
            <p className="text-lg font-bold text-ios-dark">{(stats.contacts || tenant.currentContacts || 0).toLocaleString()}</p>
            <p className="text-xs text-ios-muted">of {(tenant.plan?.maxContacts || '∞').toLocaleString()}</p>
          </div>
          <div className="bg-ios-gray rounded-apple-lg p-4">
            <p className="text-xs text-ios-muted">Messages</p>
            <p className="text-lg font-bold text-ios-dark">{(stats.messages || tenant.currentMessages || 0).toLocaleString()}</p>
            <p className="text-xs text-ios-muted">this period</p>
          </div>
          <div className="bg-ios-gray rounded-apple-lg p-4">
            <p className="text-xs text-ios-muted">Team Members</p>
            <p className="text-lg font-bold text-ios-dark">{stats.teamMembers || tenant.users?.length || 0}</p>
            <p className="text-xs text-ios-muted">of {tenant.plan?.maxTeamMembers || '∞'}</p>
          </div>
        </div>
      </div>

      {/* Plan Change */}
      <div>
        <h4 className="text-sm font-semibold text-ios-dark mb-3">Change Plan</h4>
        <div className="grid grid-cols-2 gap-3">
          {plans.map((plan: any) => {
            const isCurrent = tenant.planId === plan.id || tenant.plan?.id === plan.id;
            return (
              <div
                key={plan.id}
                className={`border rounded-apple-lg p-4 cursor-pointer transition ${
                  isCurrent
                    ? 'border-wa-green bg-wa-green/5'
                    : 'border-black/10 hover:border-black/30 hover:bg-ios-gray/50'
                } ${selectedPlanId === plan.id ? 'ring-2 ring-wa-green' : ''}`}
                onClick={() => !isCurrent && setSelectedPlanId(plan.id === selectedPlanId ? '' : plan.id)}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ios-dark">{plan.name}</p>
                  {isCurrent && <span className="text-xs bg-wa-green text-white px-2 py-0.5 rounded-apple-full">Current</span>}
                </div>
                <p className="text-xs text-ios-muted mt-1">${plan.monthlyPrice}/month</p>
                <div className="mt-2 text-xs text-ios-muted space-y-0.5">
                  <p>{plan.maxContacts.toLocaleString()} contacts</p>
                  <p>{plan.maxTeamMembers} team members</p>
                </div>
              </div>
            );
          })}
        </div>
        {selectedPlanId && (
          <div className="mt-4 p-4 bg-apple-orange/10 border border-apple-orange/30 rounded-apple-lg">
            <p className="text-sm text-ios-secondary mb-3">
              Confirm plan change to: <strong>{plans.find((p: any) => p.id === selectedPlanId)?.name}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => changePlanMutation.mutate(selectedPlanId)}
                disabled={changePlanMutation.isPending}
                className="btn-apple bg-wa-gradient disabled:opacity-50"
              >
                {changePlanMutation.isPending ? 'Changing...' : 'Confirm Change'}
              </button>
              <button
                onClick={() => setSelectedPlanId('')}
                className="btn-apple btn-apple-outline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stripe/Custom Billing */}
      <div className="border-t border-black/5 pt-6">
        <h4 className="text-sm font-semibold text-ios-dark mb-3">Billing Settings</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ios-muted">Stripe Customer ID</p>
            <p className="font-mono text-ios-secondary">{tenant.stripeCustomerId || '—'}</p>
          </div>
          <div>
            <p className="text-ios-muted">Stripe Subscription ID</p>
            <p className="font-mono text-ios-secondary">{tenant.stripeSubId || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Add Tenant Modal
// ============================================

interface AddTenantModalProps {
  onClose: () => void;
  onSuccess: (tenant: any) => void;
}

function AddTenantModal({ onClose, onSuccess }: AddTenantModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    website: '',
    industry: '',
    planId: '',
  });
  const [createdTenant, setCreatedTenant] = useState<any>(null);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const response = await api.get('/billing/plans');
      return response.data;
    },
  });

  const plans = plansData?.data || [];

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      console.log('Creating tenant with data:', data);
      const response = await api.post('/superadmin/tenants', data);
      console.log('API response:', response.data);
      return response.data.data;
    },
    onSuccess: (data) => {
      console.log('Tenant created successfully:', data);
      setCreatedTenant(data);
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] });
    },
    onError: (err: any) => {
      console.error('Tenant creation error:', err);
      console.error('Error response:', err.response?.data);
      const errorMsg = err.response?.data?.error?.message ||
                       err.response?.data?.message ||
                       err.message ||
                       'Failed to create tenant';
      setError(errorMsg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.password) {
      setError('Name, email, and password are required');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    createMutation.mutate(form);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-black/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/10">
          <h2 className="text-lg font-semibold text-ios-dark">
            {createdTenant ? 'Tenant Created!' : 'Add New Tenant'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-ios-gray rounded-apple-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {createdTenant ? (
            <div className="space-y-4">
              <div className="bg-wa-green/10 border border-wa-green/30 rounded-apple-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-wa-green" />
                  <p className="font-medium text-ios-dark">Tenant created successfully!</p>
                </div>
                <p className="text-sm text-ios-secondary">
                  Share these credentials with your customer:
                </p>
              </div>

              <div className="bg-ios-gray rounded-apple-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-ios-muted">Company Name</p>
                    <p className="font-medium text-ios-dark">{createdTenant.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ios-muted">Email</p>
                    <p className="font-medium text-ios-dark">{form.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-ios-muted">Password</p>
                    <p className="font-mono font-bold text-wa-green bg-white px-3 py-2 rounded-apple-lg mt-1">
                      {form.password}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ios-muted">Status</p>
                    <span className="inline-block mt-1 px-2 py-1 bg-wa-green/20 text-wa-green text-xs rounded-apple-full">
                      {createdTenant.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdTenant.tempPassword);
                  }}
                  className="btn-apple btn-apple-outline flex-1 flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy Password
                </button>
                <button
                  onClick={() => onSuccess(createdTenant)}
                  className="btn-apple btn-wa-green flex-1"
                >
                  View Tenant Details
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-apple-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ios-dark mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Acme Corporation"
                  className="input-apple w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ios-dark mb-1">
                  Admin Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@company.com"
                  className="input-apple w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ios-dark mb-1">
                  Initial Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 8 characters"
                    className="input-apple w-full pr-10"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted hover:text-ios-dark"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-ios-muted mt-1">Minimum 8 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ios-dark mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://company.com"
                  className="input-apple w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ios-dark mb-1">
                  Industry
                </label>
                <select
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  className="input-apple w-full"
                >
                  <option value="">Select industry</option>
                  <option value="SaaS">SaaS</option>
                  <option value="E-commerce">E-commerce</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Finance">Finance</option>
                  <option value="Education">Education</option>
                  <option value="Real Estate">Real Estate</option>
                  <option value="Travel">Travel</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ios-dark mb-1">
                  Plan
                </label>
                <select
                  value={form.planId}
                  onChange={(e) => setForm({ ...form, planId: e.target.value })}
                  className="input-apple w-full"
                >
                  <option value="">Select plan</option>
                  {plans.map((plan: any) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - ${plan.monthlyPrice}/month
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-apple btn-apple-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn-apple btn-wa-green flex-1 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Tenant'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
