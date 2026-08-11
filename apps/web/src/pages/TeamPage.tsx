/**
 * Team Page - Team Member Management
 * List, invite, role management, and permissions matrix
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Plus, Shield, UserCheck, Clock, Mail, X, Edit2, Trash2, MoreVertical,
  User, CheckCircle2, AlertCircle, Loader2, Search, Filter, Crown, Settings,
  MessageSquare, Send, Eye, Users, BarChart3, Phone, FileText, CreditCard
} from 'lucide-react';

type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  isActive: boolean;
  maxChats: number;
  lastLoginAt?: string;
  createdAt: string;
}

interface InviteForm {
  email: string;
  name: string;
  role: Role;
}

// Permission definitions
const PERMISSIONS = {
  dashboard: { label: 'Dashboard', icon: BarChart3 },
  contacts: { label: 'Contacts', icon: Users },
  conversations: { label: 'Conversations', icon: MessageSquare },
  campaigns: { label: 'Campaigns', icon: Send },
  templates: { label: 'Templates', icon: FileText },
  team: { label: 'Team', icon: User },
  settings: { label: 'Settings', icon: Settings },
  billing: { label: 'Billing', icon: CreditCard },
  analytics: { label: 'Analytics', icon: BarChart3 },
};

const ACTIONS = ['create', 'read', 'update', 'delete', 'send', 'export'] as const;

// Role-based permission matrix
const ROLE_PERMISSIONS: Record<Role, Record<string, Record<(typeof ACTIONS)[number], boolean>>> = {
  OWNER: {
    dashboard: { create: true, read: true, update: true, delete: true, send: true, export: true },
    contacts: { create: true, read: true, update: true, delete: true, send: true, export: true },
    conversations: { create: true, read: true, update: true, delete: true, send: true, export: true },
    campaigns: { create: true, read: true, update: true, delete: true, send: true, export: true },
    templates: { create: true, read: true, update: true, delete: true, send: true, export: true },
    team: { create: true, read: true, update: true, delete: true, send: true, export: true },
    settings: { create: true, read: true, update: true, delete: true, send: true, export: true },
    billing: { create: true, read: true, update: true, delete: true, send: true, export: true },
    analytics: { create: true, read: true, update: true, delete: true, send: true, export: true },
  },
  ADMIN: {
    dashboard: { create: false, read: true, update: false, delete: false, send: false, export: true },
    contacts: { create: true, read: true, update: true, delete: true, send: false, export: true },
    conversations: { create: false, read: true, update: true, delete: true, send: true, export: true },
    campaigns: { create: true, read: true, update: true, delete: true, send: true, export: true },
    templates: { create: true, read: true, update: true, delete: true, send: true, export: true },
    team: { create: true, read: true, update: true, delete: true, send: false, export: true },
    settings: { create: false, read: true, update: true, delete: false, send: false, export: false },
    billing: { create: false, read: true, update: false, delete: false, send: false, export: false },
    analytics: { create: false, read: true, update: false, delete: false, send: false, export: true },
  },
  MANAGER: {
    dashboard: { create: false, read: true, update: false, delete: false, send: false, export: true },
    contacts: { create: true, read: true, update: true, delete: false, send: false, export: true },
    conversations: { create: false, read: true, update: true, delete: false, send: true, export: true },
    campaigns: { create: true, read: true, update: true, delete: false, send: true, export: true },
    templates: { create: true, read: true, update: true, delete: false, send: true, export: true },
    team: { create: false, read: true, update: false, delete: false, send: false, export: false },
    settings: { create: false, read: false, update: false, delete: false, send: false, export: false },
    billing: { create: false, read: false, update: false, delete: false, send: false, export: false },
    analytics: { create: false, read: true, update: false, delete: false, send: false, export: true },
  },
  AGENT: {
    dashboard: { create: false, read: false, update: false, delete: false, send: false, export: false },
    contacts: { create: false, read: true, update: true, delete: false, send: false, export: false },
    conversations: { create: false, read: true, update: true, delete: false, send: true, export: false },
    campaigns: { create: false, read: false, update: false, delete: false, send: false, export: false },
    templates: { create: false, read: false, update: false, delete: false, send: false, export: false },
    team: { create: false, read: false, update: false, delete: false, send: false, export: false },
    settings: { create: false, read: false, update: false, delete: false, send: false, export: false },
    billing: { create: false, read: false, update: false, delete: false, send: false, export: false },
    analytics: { create: false, read: false, update: false, delete: false, send: false, export: false },
  },
  VIEWER: {
    dashboard: { create: false, read: true, update: false, delete: false, send: false, export: false },
    contacts: { create: false, read: true, update: false, delete: false, send: false, export: false },
    conversations: { create: false, read: true, update: false, delete: false, send: false, export: false },
    campaigns: { create: false, read: true, update: false, delete: false, send: false, export: false },
    templates: { create: false, read: true, update: false, delete: false, send: false, export: false },
    team: { create: false, read: true, update: false, delete: false, send: false, export: false },
    settings: { create: false, read: false, update: false, delete: false, send: false, export: false },
    billing: { create: false, read: false, update: false, delete: false, send: false, export: false },
    analytics: { create: false, read: false, update: false, delete: false, send: false, export: false },
  },
};

const ROLE_COLORS: Record<Role, string> = {
  OWNER: 'bg-apple-purple/20 text-apple-purple',
  ADMIN: 'bg-wa-green/20 text-wa-green',
  MANAGER: 'bg-apple-orange/20 text-apple-orange',
  AGENT: 'bg-wa-teal/20 text-wa-teal',
  VIEWER: 'bg-ios-gray text-ios-muted',
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Full access to all features and settings',
  ADMIN: 'Manage team, campaigns, and settings',
  MANAGER: 'Manage campaigns and view analytics',
  AGENT: 'Handle conversations and contacts',
  VIEWER: 'Read-only access to conversations',
};

export default function TeamPage() {
  const [view, setView] = useState<'list' | 'permissions'>('list');
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState<TeamMember | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteForm>({ email: '', name: '', role: 'AGENT' });
  const queryClient = useQueryClient();

  // Show notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Fetch team members
  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const response = await api.get('/team');
      return response.data;
    },
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (payload: InviteForm) => {
      const response = await api.post('/team/invite', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setShowInvite(false);
      setInviteForm({ email: '', name: '', role: 'AGENT' });
      showNotification('success', 'Invitation sent successfully!');
    },
    onError: (error: any) => {
      showNotification('error', error.response?.data?.error?.message || 'Failed to send invitation');
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role, maxChats }: { id: string; role: Role; maxChats: number }) => {
      const response = await api.patch(`/team/${id}`, { role, maxChats });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setShowEdit(null);
      showNotification('success', 'Member updated successfully!');
    },
    onError: (error: any) => {
      showNotification('error', error.response?.data?.error?.message || 'Failed to update member');
    },
  });

  // Remove member mutation
  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/team/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setShowEdit(null);
      showNotification('success', 'Member removed successfully');
    },
    onError: (error: any) => {
      showNotification('error', error.response?.data?.error?.message || 'Failed to remove member');
    },
  });

  // Resend invite mutation
  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/team/${id}/resend-invite`);
      return response.data;
    },
    onSuccess: () => {
      showNotification('success', 'Invitation resent!');
    },
    onError: (error: any) => {
      showNotification('error', error.response?.data?.error?.message || 'Failed to resend invitation');
    },
  });

  // Transform data
  const members: TeamMember[] = (data?.data || []).map((m: any) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role as Role,
    avatarUrl: m.avatarUrl,
    isActive: m.isActive,
    maxChats: m.maxChats,
    lastLoginAt: m.lastLoginAt,
    createdAt: m.createdAt,
  }));

  // Filter members
  const filtered = members.filter(m => {
    const matchesSearch = !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Stats
  const stats = {
    total: members.length,
    active: members.filter(m => m.isActive && m.lastLoginAt).length,
    pending: members.filter(m => !m.lastLoginAt).length,
  };

  const formatDate = (date?: string) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatLastActive = (date?: string) => {
    if (!date) return 'Pending invite';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(date);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-wa">Team Management</h1>
          <p className="text-ios-secondary mt-1">Manage your team members and permissions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView(view === 'list' ? 'permissions' : 'list')}
            className={`btn-apple flex items-center gap-2 ${view === 'permissions' ? 'btn-wa-green' : 'btn-apple-outline'}`}
          >
            <Shield className="w-4 h-4" />
            {view === 'list' ? 'Permissions' : 'Team List'}
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="btn-apple btn-wa-green flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Invite Member
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-apple p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ios-dark">{stats.total}</p>
              <p className="text-sm text-ios-muted">Total Members</p>
            </div>
          </div>
        </div>
        <div className="card-apple p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-apple-green/20 text-apple-green rounded-apple-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ios-dark">{stats.active}</p>
              <p className="text-sm text-ios-muted">Active</p>
            </div>
          </div>
        </div>
        <div className="card-apple p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-apple-orange/20 text-apple-orange rounded-apple-lg flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ios-dark">{stats.pending}</p>
              <p className="text-sm text-ios-muted">Pending</p>
            </div>
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <>
          {/* Filters */}
          <div className="card-apple p-4 flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members..."
                className="input-apple w-full pl-10"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}
              className="input-apple"
            >
              <option value="all">All Roles</option>
              <option value="OWNER">Owner</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="AGENT">Agent</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>

          {/* Team List */}
          {isLoading ? (
            <div className="card-apple p-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card-apple p-12 text-center">
              <Users className="w-12 h-12 text-ios-muted mx-auto mb-3 opacity-50" />
              <p className="text-ios-secondary font-medium">No members found</p>
              <p className="text-sm text-ios-muted mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="card-apple overflow-hidden">
              <table className="w-full">
                <thead className="bg-ios-gray/50">
                  <tr className="text-left text-sm text-ios-muted">
                    <th className="px-6 py-3 font-medium">Member</th>
                    <th className="px-6 py-3 font-medium">Role</th>
                    <th className="px-6 py-3 font-medium">Max Chats</th>
                    <th className="px-6 py-3 font-medium">Last Active</th>
                    <th className="px-6 py-3 font-medium">Joined</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filtered.map((member) => (
                    <tr key={member.id} className="hover:bg-ios-gray/30 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                            member.role === 'OWNER' ? 'bg-apple-purple' :
                            member.role === 'ADMIN' ? 'bg-wa-green' :
                            member.role === 'MANAGER' ? 'bg-apple-orange' :
                            member.role === 'AGENT' ? 'bg-wa-teal' : 'bg-ios-gray'
                          }`}>
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-ios-dark flex items-center gap-2">
                              {member.name}
                              {member.role === 'OWNER' && <Crown className="w-4 h-4 text-apple-purple" />}
                            </p>
                            <p className="text-sm text-ios-muted">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${ROLE_COLORS[member.role]}`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-ios-dark">{member.maxChats}</td>
                      <td className="px-6 py-4 text-ios-muted text-sm">
                        {formatLastActive(member.lastLoginAt)}
                      </td>
                      <td className="px-6 py-4 text-ios-muted text-sm">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {member.role !== 'OWNER' && (
                            <button
                              onClick={() => setShowEdit(member)}
                              className="p-2 hover:bg-ios-gray rounded-apple-lg text-ios-muted transition"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {member.role === 'AGENT' && (
                            <button
                              onClick={() => resendMutation.mutate(member.id)}
                              className="p-2 hover:bg-ios-gray rounded-apple-lg text-ios-muted transition"
                              title="Resend invite"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* Permissions Matrix */
        <div className="card-apple p-6 overflow-x-auto">
          <h3 className="font-semibold text-ios-dark mb-4">Permissions Matrix</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/10">
                <th className="text-left py-3 px-4 text-sm font-medium text-ios-muted">Resource</th>
                {ACTIONS.map(action => (
                  <th key={action} className="text-center py-3 px-2 text-xs font-medium text-ios-muted uppercase">
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSIONS).map(([resource, { label }]) => (
                <tr key={resource} className="border-b border-black/5">
                  <td className="py-3 px-4 font-medium text-ios-dark">{label}</td>
                  {ACTIONS.map(action => (
                    <td key={action} className="py-3 px-2 text-center">
                      {/* Show a representative cell based on highest permission level */}
                      <div className="flex items-center justify-center gap-1">
                        {(['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER'] as Role[]).map(role => (
                          <div
                            key={role}
                            className={`w-6 h-6 rounded flex items-center justify-center ${
                              ROLE_PERMISSIONS[role][resource]?.[action]
                                ? 'bg-wa-green text-white'
                                : 'bg-ios-gray text-ios-muted/30'
                            }`}
                            title={`${role}: ${ROLE_PERMISSIONS[role][resource]?.[action] ? '✓' : '✗'}`}
                          >
                            {ROLE_PERMISSIONS[role][resource]?.[action] ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 text-xs text-ios-muted">
                    <span className="font-medium">Legend:</span>
                    <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-wa-green" /> = Has permission</div>
                    <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-ios-gray" /> = No permission</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-black/5 text-xs">
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-apple-purple text-white flex items-center justify-center text-[10px] font-bold">O</div>
              Owner
            </span>
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-wa-green text-white flex items-center justify-center text-[10px] font-bold">A</div>
              Admin
            </span>
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-apple-orange text-white flex items-center justify-center text-[10px] font-bold">M</div>
              Manager
            </span>
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-wa-teal text-white flex items-center justify-center text-[10px] font-bold">G</div>
              Agent
            </span>
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-ios-gray text-ios-muted flex items-center justify-center text-[10px] font-bold">V</div>
              Viewer
            </span>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card rounded-apple-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">Invite Team Member</h3>
              <button onClick={() => setShowInvite(false)} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Name *</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="John Doe"
                  className="input-apple w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Email *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="john@company.com"
                  className="input-apple w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Role *</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Role })}
                  className="input-apple w-full"
                >
                  <option value="ADMIN">Admin - Full access (except billing)</option>
                  <option value="MANAGER">Manager - Manage campaigns</option>
                  <option value="AGENT">Agent - Handle conversations</option>
                  <option value="VIEWER">Viewer - Read-only access</option>
                </select>
                <p className="text-xs text-ios-muted mt-1">{ROLE_DESCRIPTIONS[inviteForm.role]}</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => inviteMutation.mutate(inviteForm)}
                  disabled={!inviteForm.email || !inviteForm.name || inviteMutation.isPending}
                  className="flex-1 py-3 btn-apple btn-wa-green rounded-apple-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {inviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send Invitation
                </button>
                <button onClick={() => setShowInvite(false)} className="flex-1 py-3 btn-apple btn-apple-outline rounded-apple-lg">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card rounded-apple-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">Edit Member</h3>
              <button onClick={() => setShowEdit(null)} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="flex items-center gap-4 mb-6 p-4 bg-ios-gray/50 rounded-apple-lg">
              <div className="w-12 h-12 rounded-full bg-wa-green flex items-center justify-center font-bold text-white text-lg">
                {showEdit.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-ios-dark">{showEdit.name}</p>
                <p className="text-sm text-ios-muted">{showEdit.email}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Role</label>
                <select
                  value={showEdit.role}
                  onChange={(e) => setShowEdit({ ...showEdit, role: e.target.value as Role })}
                  className="input-apple w-full"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="AGENT">Agent</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              {showEdit.role === 'AGENT' && (
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Max Concurrent Chats</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={showEdit.maxChats}
                    onChange={(e) => setShowEdit({ ...showEdit, maxChats: parseInt(e.target.value) || 5 })}
                    className="input-apple w-full"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => updateRoleMutation.mutate({ id: showEdit.id, role: showEdit.role, maxChats: showEdit.maxChats })}
                  disabled={updateRoleMutation.isPending}
                  className="flex-1 py-3 btn-apple btn-wa-green rounded-apple-lg font-medium disabled:opacity-50"
                >
                  {updateRoleMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => { if (confirm('Remove this member?')) removeMutation.mutate(showEdit.id); }}
                  disabled={removeMutation.isPending}
                  className="py-3 px-4 border border-apple-red/30 text-apple-red rounded-apple-lg hover:bg-apple-red/10 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
