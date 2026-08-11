/**
 * Segments Page - Audience Segmentation
 * Create dynamic segments with filters for contacts
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Plus, Search, Users, X, Filter, Trash2, Edit2, MoreVertical, ChevronRight,
  CheckCircle2, AlertCircle, Loader2, RefreshCw, Eye, Play, Pause, Zap
} from 'lucide-react';

interface SegmentCondition {
  field: string;
  operator: string;
  value: string;
}

interface Segment {
  id: string;
  name: string;
  description?: string;
  totalContacts: number;
  color: string;
  query: {
    type: 'all' | 'any';
    conditions: SegmentCondition[];
  };
  createdAt: string;
  updatedAt: string;
}

interface SegmentPreview {
  total: number;
  matching: { id: string; name: string; phone: string }[];
}

const FIELDS = [
  { value: 'tag', label: 'Tag' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'lastMessageAt', label: 'Last Message' },
  { value: 'createdAt', label: 'Created Date' },
  { value: 'totalMessagesSent', label: 'Messages Sent' },
  { value: 'language', label: 'Language' },
  { value: 'company', label: 'Company' },
];

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'within_days', label: 'within (days)' },
];

const COLORS = ['wa-green', 'apple-green', 'apple-purple', 'apple-orange', 'apple-indigo', 'apple-red'];

const COLOR_MAP: Record<string, string> = {
  'wa-green': 'bg-wa-green',
  'apple-green': 'bg-apple-green',
  'apple-purple': 'bg-apple-purple',
  'apple-orange': 'bg-apple-orange',
  'apple-indigo': 'bg-apple-indigo',
  'apple-red': 'bg-apple-red',
};

export default function SegmentsPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [previewSegment, setPreviewSegment] = useState<Segment | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    matchType: 'all' as 'all' | 'any',
    conditions: [{ field: 'tag', operator: 'equals', value: '' }],
  });
  const queryClient = useQueryClient();

  // Show notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Fetch segments
  const { data, isLoading } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => {
      const response = await api.get('/segments');
      return response.data;
    },
  });

  // Fetch segment preview
  const { data: previewData, isLoading: isPreviewLoading } = useQuery({
    queryKey: ['segments-preview', previewSegment?.id],
    queryFn: async () => {
      if (!previewSegment) return null;
      const response = await api.get(`/segments/${previewSegment.id}/preview`);
      return response.data;
    },
    enabled: !!previewSegment,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const conditions = payload.conditions
        .filter(c => c.field && c.operator && c.value)
        .map(c => ({ field: c.field, operator: c.operator, value: c.value }));

      const response = await api.post('/segments', {
        name: payload.name,
        description: payload.description,
        rules: {
          type: payload.matchType,
          conditions,
        },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] });
      setShowCreate(false);
      setForm({
        name: '',
        description: '',
        matchType: 'all',
        conditions: [{ field: 'tag', operator: 'equals', value: '' }],
      });
      showNotification('success', 'Segment created successfully!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to create segment';
      showNotification('error', message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof form }) => {
      const conditions = payload.conditions
        .filter(c => c.field && c.operator && c.value)
        .map(c => ({ field: c.field, operator: c.operator, value: c.value }));

      const response = await api.patch(`/segments/${id}`, {
        name: payload.name,
        description: payload.description,
        rules: {
          type: payload.matchType,
          conditions,
        },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] });
      setEditing(null);
      showNotification('success', 'Segment updated successfully!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to update segment';
      showNotification('error', message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/segments/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] });
      setEditing(null);
      showNotification('success', 'Segment deleted successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to delete segment';
      showNotification('error', message);
    },
  });

  // Sync contacts mutation
  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/segments/${id}/sync`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] });
      showNotification('success', 'Segment contacts synced!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to sync contacts';
      showNotification('error', message);
    },
  });

  // Transform segments
  const segments: Segment[] = (data?.data || []).map((s: any, index: number) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    totalContacts: s.totalContacts || 0,
    color: COLORS[index % COLORS.length],
    query: s.query || { type: 'all', conditions: [] },
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

  const filtered = segments.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Form helpers
  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { field: 'tag', operator: 'equals', value: '' }] });
  };

  const updateCondition = (i: number, key: keyof SegmentCondition, value: string) => {
    const updated = [...form.conditions];
    updated[i] = { ...updated[i], [key]: value };
    setForm({ ...form, conditions: updated });
  };

  const removeCondition = (i: number) => {
    if (form.conditions.length > 1) {
      setForm({ ...form, conditions: form.conditions.filter((_, idx) => idx !== i) });
    }
  };

  const openEdit = (segment: Segment) => {
    setEditing(segment);
    setForm({
      name: segment.name,
      description: segment.description || '',
      matchType: segment.query?.type || 'all',
      conditions: segment.query?.conditions?.length > 0
        ? segment.query.conditions
        : [{ field: 'tag', operator: 'equals', value: '' }],
    });
  };

  const preview = previewData?.data as SegmentPreview;

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-apple-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right ${
          notification.type === 'success'
            ? 'bg-apple-green text-white'
            : 'bg-apple-red text-white'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-wa">Segments</h1>
          <p className="text-ios-secondary mt-1">
            {segments.length} segments · {segments.reduce((sum, s) => sum + s.totalContacts, 0).toLocaleString()} total contacts
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-apple btn-wa-green flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Segment
        </button>
      </div>

      {/* Search */}
      <div className="card-apple p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search segments..."
            className="input-apple w-full pl-10"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-ios-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Segments Grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-apple p-5 animate-pulse">
              <div className="h-4 bg-ios-gray rounded w-1/2 mb-4" />
              <div className="h-8 bg-ios-gray rounded w-1/4 mb-4" />
              <div className="h-3 bg-ios-gray rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-apple p-16 text-center">
          <Users className="w-12 h-12 text-ios-muted mx-auto mb-3 opacity-50" />
          <p className="text-ios-secondary font-medium">No segments found</p>
          <p className="text-sm text-ios-muted mt-1">Create a segment to organize your contacts</p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-apple btn-wa-green mt-4 flex items-center gap-2 mx-auto"
          >
            <Plus className="w-4 h-4" />
            Create Segment
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((segment) => (
            <div key={segment.id} className="card-apple p-5 hover:shadow-apple-hover transition">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${COLOR_MAP[segment.color]}/20 rounded-apple-lg flex items-center justify-center`}>
                    <div className={`w-4 h-4 rounded-full ${COLOR_MAP[segment.color]}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-ios-dark">{segment.name}</p>
                    <p className="text-xs text-ios-muted">{segment.description || 'No description'}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(segment); }}
                  className="p-1.5 hover:bg-ios-gray rounded-apple-lg text-ios-muted transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {/* Contact count */}
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-ios-muted" />
                <span className="text-2xl font-bold text-ios-dark">{segment.totalContacts.toLocaleString()}</span>
                <span className="text-sm text-ios-muted">contacts</span>
              </div>

              {/* Conditions summary */}
              <div className="space-y-1.5 mb-4">
                <p className="text-xs font-medium text-ios-muted flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  Match {segment.query?.type === 'any' ? 'ANY' : 'ALL'} conditions:
                </p>
                {segment.query?.conditions?.slice(0, 3).map((cond, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span className="text-wa-green">{cond.field}</span>
                    <span className="text-ios-muted">{cond.operator}</span>
                    <span className="text-ios-secondary font-medium truncate">{cond.value}</span>
                  </div>
                ))}
                {segment.query?.conditions?.length > 3 && (
                  <p className="text-xs text-ios-muted">+{segment.query.conditions.length - 3} more</p>
                )}
                {(!segment.query?.conditions || segment.query.conditions.length === 0) && (
                  <p className="text-xs text-ios-muted italic">All contacts</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-3 border-t border-black/5">
                <button
                  onClick={() => setPreviewSegment(segment)}
                  className="flex-1 btn-apple btn-apple-outline text-sm py-2 flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button
                  onClick={() => syncMutation.mutate(segment.id)}
                  disabled={syncMutation.isPending}
                  className="btn-apple btn-apple-outline text-sm py-2 px-3"
                  title="Sync contacts"
                >
                  <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => { if (confirm('Delete this segment?')) deleteMutation.mutate(segment.id); }}
                  disabled={deleteMutation.isPending}
                  className="btn-apple text-sm py-2 px-3 text-apple-red hover:bg-apple-red/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editing) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">
                {editing ? 'Edit Segment' : 'Create Segment'}
              </h3>
              <button
                onClick={() => { setShowCreate(false); setEditing(null); }}
                className="p-1 hover:bg-ios-gray rounded-apple-lg"
              >
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Segment Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. High-Value Leads"
                  className="input-apple w-full"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short description of this segment"
                  className="input-apple w-full"
                />
              </div>

              {/* Match Type */}
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-2">Match Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.matchType === 'all'}
                      onChange={() => setForm({ ...form, matchType: 'all' })}
                      className="w-4 h-4 text-wa-green"
                    />
                    <span className="text-sm text-ios-dark">Match ALL conditions (AND)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.matchType === 'any'}
                      onChange={() => setForm({ ...form, matchType: 'any' })}
                      className="w-4 h-4 text-wa-green"
                    />
                    <span className="text-sm text-ios-dark">Match ANY condition (OR)</span>
                  </label>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-ios-secondary">Conditions</label>
                  <button onClick={addCondition} className="text-xs text-wa-green hover:underline">
                    + Add condition
                  </button>
                </div>
                <div className="space-y-2">
                  {form.conditions.map((cond, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={cond.field}
                        onChange={(e) => updateCondition(i, 'field', e.target.value)}
                        className="input-apple w-32"
                      >
                        {FIELDS.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(i, 'operator', e.target.value)}
                        className="input-apple w-32"
                      >
                        {OPERATORS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {['is_empty', 'is_not_empty'].includes(cond.operator) ? (
                        <span className="flex-1 text-sm text-ios-muted italic">—</span>
                      ) : (
                        <input
                          type="text"
                          value={cond.value}
                          onChange={(e) => updateCondition(i, 'value', e.target.value)}
                          placeholder="Value"
                          className="input-apple flex-1"
                        />
                      )}
                      {form.conditions.length > 1 && (
                        <button
                          onClick={() => removeCondition(i)}
                          className="p-1.5 hover:bg-apple-red/10 rounded-apple text-apple-red"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => editing
                    ? updateMutation.mutate({ id: editing.id, payload: form })
                    : createMutation.mutate(form)
                  }
                  disabled={
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    !form.name.trim()
                  }
                  className="flex-1 py-3 btn-apple btn-wa-green rounded-apple-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {editing ? 'Save Changes' : 'Create Segment'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setEditing(null); }}
                  className="flex-1 py-3 btn-apple btn-apple-outline rounded-apple-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewSegment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-ios-dark">Preview: {previewSegment.name}</h3>
                <p className="text-sm text-ios-muted">{previewSegment.totalContacts.toLocaleString()} contacts match</p>
              </div>
              <button
                onClick={() => setPreviewSegment(null)}
                className="p-1 hover:bg-ios-gray rounded-apple-lg"
              >
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            {isPreviewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
              </div>
            ) : preview?.matching && preview.matching.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-ios-muted mb-2">Matching contacts:</p>
                {preview.matching.slice(0, 20).map((contact: any) => (
                  <div key={contact.id} className="flex items-center gap-3 p-3 bg-ios-gray/50 rounded-apple-lg">
                    <div className="w-8 h-8 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-medium text-sm">
                      {contact.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ios-dark text-sm truncate">{contact.name || 'Unknown'}</p>
                      <p className="text-xs text-ios-muted">{contact.phone}</p>
                    </div>
                  </div>
                ))}
                {preview.total > 20 && (
                  <p className="text-sm text-ios-muted text-center pt-2">
                    +{preview.total - 20} more contacts
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-ios-muted mx-auto mb-3 opacity-50" />
                <p className="text-ios-secondary">No contacts match these conditions</p>
              </div>
            )}

            <button
              onClick={() => setPreviewSegment(null)}
              className="w-full py-2 mt-4 btn-apple btn-apple-outline rounded-apple-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
