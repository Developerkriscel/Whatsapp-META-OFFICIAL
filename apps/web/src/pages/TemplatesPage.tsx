import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Plus, Search, X, FileText, Send, Check, Clock, AlertCircle, Copy, Edit3, SendHorizontal, CheckCircle2, Loader2, Trash2 } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string;
  language: string;
  body: { text: string };
  header?: { type: string; text: string };
  footer?: string;
  buttons?: { type: string; text: string }[];
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  totalSent?: number;
  lastSentAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-ios-gray text-ios-secondary',
  PENDING: 'bg-apple-orange/20 text-apple-orange',
  APPROVED: 'bg-apple-green/20 text-apple-green',
  REJECTED: 'bg-apple-red/20 text-apple-red',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const LANGUAGE_LABELS: Record<string, string> = {
  en_US: 'English (US)',
  en_GB: 'English (UK)',
  es: 'Spanish',
  pt_BR: 'Portuguese (BR)',
  ar: 'Arabic',
  hi: 'Hindi',
  zh_CN: 'Chinese (Simplified)',
  fr: 'French',
  de: 'German',
  id: 'Indonesian',
};

export default function TemplatesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Template | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: 'MARKETING' as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    language: 'en_US',
    bodyText: '',
  });
  const queryClient = useQueryClient();

  // Show notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['templates', category],
    queryFn: async () => {
      const response = await api.get('/templates');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const response = await api.post('/templates', {
        name: payload.name,
        category: payload.category,
        language: payload.language,
        body: { text: payload.bodyText },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowCreate(false);
      setForm({ name: '', category: 'MARKETING', language: 'en_US', bodyText: '' });
      showNotification('success', 'Template created successfully!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to create template';
      showNotification('error', message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const response = await api.patch(`/templates/${id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowEdit(null);
      showNotification('success', 'Template updated successfully!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to update template';
      showNotification('error', message);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await api.post(`/templates/${templateId}/submit`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelectedTemplate(null);
      showNotification('success', 'Template submitted for Meta approval!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to submit template';
      showNotification('error', message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelectedTemplate(null);
      showNotification('success', 'Template deleted successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to delete template';
      showNotification('error', message);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: Template) => {
      const response = await api.post('/templates', {
        name: `${template.name} (copy)`,
        category: template.category,
        language: template.language,
        body: template.body,
        header: template.header,
        footer: template.footer,
        buttons: template.buttons,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      showNotification('success', 'Template duplicated successfully!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to duplicate template';
      showNotification('error', message);
    },
  });

  const templates = (data?.data || []) as Template[];
  const filtered = templates.filter(t => {
    const matchesSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.body?.text?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || t.category === category;
    return matchesSearch && matchesCategory;
  });

  const categoryBadge = (cat: string) => {
    const colors: Record<string, string> = {
      MARKETING: 'bg-apple-purple/20 text-apple-purple',
      UTILITY: 'bg-wa-green/20 text-wa-green',
      AUTHENTICATION: 'bg-apple-green/20 text-apple-green',
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-apple-full ${colors[cat] || 'bg-ios-gray text-ios-secondary'}`}>
        {cat}
      </span>
    );
  };

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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Templates</h1>
          <p className="text-ios-secondary mt-1">Create and manage WhatsApp message templates</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-apple btn-wa-green flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card-apple p-4">
          <p className="text-sm text-ios-muted">Total Templates</p>
          <p className="text-2xl font-bold text-ios-dark">{templates.length}</p>
        </div>
        <div className="card-apple p-4">
          <p className="text-sm text-ios-muted">Approved</p>
          <p className="text-2xl font-bold text-apple-green">{templates.filter(t => t.status === 'APPROVED').length}</p>
        </div>
        <div className="card-apple p-4">
          <p className="text-sm text-ios-muted">Pending Review</p>
          <p className="text-2xl font-bold text-apple-orange">{templates.filter(t => t.status === 'PENDING').length}</p>
        </div>
        <div className="card-apple p-4">
          <p className="text-sm text-ios-muted">Total Messages Sent</p>
          <p className="text-2xl font-bold text-ios-dark">{templates.reduce((sum, t) => sum + (t.totalSent || 0), 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card-apple p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ios-muted" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-apple w-full pl-10"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-apple"
        >
          <option value="all">All Categories</option>
          <option value="MARKETING">Marketing</option>
          <option value="UTILITY">Utility</option>
          <option value="AUTHENTICATION">Authentication</option>
        </select>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-apple p-6 animate-pulse">
              <div className="h-4 bg-ios-gray rounded w-1/2 mb-4" />
              <div className="h-3 bg-ios-gray rounded w-3/4 mb-2" />
              <div className="h-3 bg-ios-gray rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-apple p-12 text-center">
          <FileText className="w-12 h-12 text-ios-muted mx-auto mb-4" />
          <p className="text-ios-secondary">No templates found</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 text-wa-green hover:text-wa-green/80">
            Create your first template →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => (
            <div
              key={template.id}
              onClick={() => setSelectedTemplate(template)}
              className="card-apple p-5 cursor-pointer hover:shadow-apple-hover transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-wa-green" />
                  <span className="font-medium text-ios-dark">{template.name}</span>
                </div>
                <span className={`px-2 py-0.5 text-xs rounded-apple-full ${STATUS_COLORS[template.status] || 'bg-ios-gray text-ios-secondary'}`}>
                  {STATUS_LABELS[template.status] || template.status}
                </span>
              </div>
              <p className="text-sm text-ios-secondary mb-3 line-clamp-2">
                {template.body?.text || 'No content'}
              </p>
              <div className="flex items-center justify-between">
                {categoryBadge(template.category)}
                <span className="text-xs text-ios-muted">{LANGUAGE_LABELS[template.language] || template.language}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card p-6 w-[520px] shadow-apple-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ios-dark">Create Template</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-ios-gray rounded-apple-lg transition">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Template Name *</label>
                <input
                  type="text"
                  placeholder="e.g., welcome_message"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-apple w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                    className="input-apple w-full"
                  >
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1">Language</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="input-apple w-full"
                  >
                    <option value="en_US">English (US)</option>
                    <option value="en_GB">English (UK)</option>
                    <option value="es">Spanish</option>
                    <option value="pt_BR">Portuguese (BR)</option>
                    <option value="ar">Arabic</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Message Body *</label>
                <textarea
                  placeholder="Hi {{1}}, welcome to our service!"
                  value={form.bodyText}
                  onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                  rows={4}
                  className="input-apple w-full resize-none"
                />
                <p className="text-xs text-ios-muted mt-1">Use {'{{1}}'}, {'{{2}}'} for variables</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => createMutation.mutate(form)}
                  disabled={!form.name.trim() || !form.bodyText.trim() || createMutation.isPending}
                  className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Template'}
                </button>
                <button onClick={() => setShowCreate(false)} className="flex-1 btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card p-6 w-[520px] shadow-apple-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-wa-green" />
                <h3 className="font-semibold text-ios-dark">{selectedTemplate.name}</h3>
                <span className={`px-2 py-0.5 text-xs rounded-apple-full ${STATUS_COLORS[selectedTemplate.status]}`}>
                  {STATUS_LABELS[selectedTemplate.status]}
                </span>
              </div>
              <button onClick={() => setSelectedTemplate(null)} className="p-1 hover:bg-ios-gray rounded-apple-lg transition">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            {/* Rejection Reason Alert */}
            {selectedTemplate.status === 'REJECTED' && selectedTemplate.rejectionReason && (
              <div className="bg-apple-red/10 border border-apple-red/20 rounded-apple-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-apple-red flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-apple-red">Meta Rejection Reason:</p>
                    <p className="text-sm text-ios-secondary mt-1">{selectedTemplate.rejectionReason}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ios-muted">Category</span>
                {categoryBadge(selectedTemplate.category)}
              </div>
              <div className="flex justify-between">
                <span className="text-ios-muted">Language</span>
                <span className="font-medium text-ios-dark">{LANGUAGE_LABELS[selectedTemplate.language] || selectedTemplate.language}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ios-muted">Times Used</span>
                <span className="font-medium text-ios-dark">{selectedTemplate.totalSent?.toLocaleString() || 0} sends</span>
              </div>
              {selectedTemplate.lastSentAt && (
                <div className="flex justify-between">
                  <span className="text-ios-muted">Last Sent</span>
                  <span className="font-medium text-ios-dark">{new Date(selectedTemplate.lastSentAt).toLocaleDateString()}</span>
                </div>
              )}
              <div>
                <span className="text-ios-muted block mb-1">Message Body</span>
                <div className="bg-ios-gray rounded-apple-lg p-3 text-ios-dark whitespace-pre-wrap">
                  {selectedTemplate.body?.text}
                </div>
              </div>
              {selectedTemplate.header && (
                <div>
                  <span className="text-ios-muted block mb-1">Header ({selectedTemplate.header.type})</span>
                  <p className="text-ios-dark">{selectedTemplate.header.text}</p>
                </div>
              )}
              {selectedTemplate.footer && (
                <div>
                  <span className="text-ios-muted block mb-1">Footer</span>
                  <p className="text-ios-secondary">{selectedTemplate.footer}</p>
                </div>
              )}
              {(selectedTemplate.buttons?.length ?? 0) > 0 && (
                <div>
                  <span className="text-ios-muted block mb-2">Buttons ({selectedTemplate.buttons?.length})</span>
                  <div className="space-y-1">
                    {(selectedTemplate.buttons || []).map((btn: any, i: number) => (
                      <div key={i} className="flex gap-2 items-center">
                        <span className="w-6 h-6 bg-wa-green/20 text-wa-green rounded-apple text-xs flex items-center justify-center">{i + 1}</span>
                        <span className="text-ios-dark">{btn.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between text-xs text-ios-muted pt-2">
                <span>Created {new Date(selectedTemplate.createdAt).toLocaleDateString()}</span>
                <span>Updated {new Date(selectedTemplate.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-black/5">
              {(selectedTemplate.status === 'DRAFT' || selectedTemplate.status === 'REJECTED') && (
                <button
                  onClick={() => submitMutation.mutate(selectedTemplate.id)}
                  disabled={submitMutation.isPending}
                  className="flex-1 px-4 py-2 bg-wa-gradient text-white rounded-apple-lg hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="w-4 h-4" />
                  )}
                  Submit for Approval
                </button>
              )}
              <button
                onClick={() => {
                  setShowEdit(selectedTemplate);
                  setForm({
                    name: selectedTemplate.name,
                    category: selectedTemplate.category as any,
                    language: selectedTemplate.language,
                    bodyText: selectedTemplate.body?.text || '',
                  });
                  setSelectedTemplate(null);
                }}
                className="flex-1 px-4 py-2 border border-wa-green/30 text-wa-green rounded-apple-lg hover:bg-wa-green/10 transition flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => duplicateMutation.mutate(selectedTemplate)}
                disabled={duplicateMutation.isPending}
                className="flex-1 px-4 py-2 border border-black/10 text-ios-dark rounded-apple-lg hover:bg-ios-gray/50 transition flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              <button
                onClick={() => deleteMutation.mutate(selectedTemplate.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 border border-apple-red/30 text-apple-red rounded-apple-lg hover:bg-apple-red/10 disabled:opacity-50 transition flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card p-6 w-[520px] shadow-apple-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ios-dark">Edit Template</h3>
              <button onClick={() => setShowEdit(null)} className="p-1 hover:bg-ios-gray rounded-apple-lg transition">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Template Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-apple w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                    className="input-apple w-full"
                  >
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1">Language</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="input-apple w-full"
                  >
                    <option value="en_US">English (US)</option>
                    <option value="en_GB">English (UK)</option>
                    <option value="es">Spanish</option>
                    <option value="pt_BR">Portuguese (BR)</option>
                    <option value="ar">Arabic</option>
                    <option value="hi">Hindi</option>
                    <option value="zh_CN">Chinese (Simplified)</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="id">Indonesian</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Message Body *</label>
                <textarea
                  value={form.bodyText}
                  onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                  rows={4}
                  className="input-apple w-full resize-none"
                />
                <p className="text-xs text-ios-muted mt-1">Use {'{{1}}'}, {'{{2}}'} for variables</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => updateMutation.mutate({ id: showEdit.id, payload: {
                    name: form.name,
                    category: form.category,
                    language: form.language,
                    body: { text: form.bodyText },
                  }})}
                  disabled={!form.name.trim() || !form.bodyText.trim() || updateMutation.isPending}
                  className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setShowEdit(null)} className="flex-1 btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
