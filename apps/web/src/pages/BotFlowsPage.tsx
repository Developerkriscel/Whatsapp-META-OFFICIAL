/**
 * Chatbot Flows Page
 * List, create, activate/deactivate, and visually edit bot flows.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationApi, api } from '../api/client';
import { MessageSquare, Plus, X, Trash2, Zap, Play, Pause, Copy, Settings, Sparkles, Database, Star, AlertTriangle, Phone } from 'lucide-react';
import FlowBuilder from '../components/FlowBuilder';
import FlowAISuggestModal from '../components/FlowAISuggestModal';
import KnowledgeBaseModal from '../components/KnowledgeBaseModal';
import { useToast } from '../components/Toast';
import { useAIStatus } from '../hooks/useAIStatus';

interface BotFlow {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  isDefault?: boolean;
  flowData: { steps: any[]; variables: any[] };
  totalTriggered?: number;
  totalResolved?: number;
  enableHumanHandoff?: boolean;
  phoneNumberIds?: string[];
  createdAt: string;
  updatedAt: string;
  _count?: { executions: number };
}

export default function BotFlowsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingFlow, setEditingFlow] = useState<BotFlow | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<BotFlow | null>(null);
  const [confirmDeleteFlow, setConfirmDeleteFlow] = useState<BotFlow | null>(null);
  const [showAISuggest, setShowAISuggest] = useState(false);
  const [showKnowledgeBases, setShowKnowledgeBases] = useState(false);
  const [assigningNumbersFlow, setAssigningNumbersFlow] = useState<BotFlow | null>(null);
  const [form, setForm] = useState({ name: '', description: '', isDefault: false });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: aiStatus } = useAIStatus();

  // ============================================
  // Queries
  // ============================================

  const { data, isLoading } = useQuery({
    queryKey: ['bot-flows'],
    queryFn: async () => {
      const response = await automationApi.listFlows();
      return response.data.data || [];
    },
  });

  // Templates
  const { data: templatesData } = useQuery({
    queryKey: ['flow-templates'],
    queryFn: async () => {
      const response = await automationApi.listTemplates();
      return response.data.data || [];
    },
  });

  // Connected phone numbers — needed so a tenant with more than one number
  // can scope which flow applies to which number, instead of every flow
  // implicitly being tenant-wide.
  const { data: phoneNumbersData } = useQuery({
    queryKey: ['whatsapp-phone-numbers'],
    queryFn: async () => {
      const response = await api.get('/whatsapp/phone-numbers');
      return response.data.data?.phoneNumbers || response.data.data || [];
    },
  });

  const botFlows: BotFlow[] = Array.isArray(data) ? data : [];
  const templates = Array.isArray(templatesData) ? templatesData : [];
  const phoneNumbers: { id: string; phoneNumber: string; displayName?: string }[] = Array.isArray(phoneNumbersData) ? phoneNumbersData : [];

  // ============================================
  // Mutations
  // ============================================

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const response = await automationApi.createFlow({
        name: payload.name,
        description: payload.description,
        isDefault: payload.isDefault,
        flowData: { steps: [], variables: [] },
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      setShowCreate(false);
      setForm({ name: '', description: '', isDefault: false });
      toast.success('Flow created! Click "Edit Flow" to add steps.');
      // Open the builder for the new flow
      if (data?.data) setEditingFlow(data.data);
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to create flow'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await automationApi.deleteFlow(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      setSelectedFlow(null);
      toast.success('Flow deleted');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to delete flow'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (isActive) {
        await automationApi.activateFlow(id);
      } else {
        await automationApi.deactivateFlow(id);
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      setSelectedFlow(prev => prev ? { ...prev, isActive: vars.isActive } : null);
      toast.success(vars.isActive ? 'Flow activated' : 'Flow deactivated');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to toggle flow'),
  });

  const setPhoneNumbersMutation = useMutation({
    mutationFn: async ({ id, phoneNumberIds }: { id: string; phoneNumberIds: string[] }) =>
      automationApi.updateFlow(id, { phoneNumberIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      setAssigningNumbersFlow(null);
      toast.success('Numbers updated for this flow');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to update numbers'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => automationApi.updateFlow(id, { isDefault: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      toast.success('Set as default flow — it will now trigger for any inbound message with no more specific match');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to set as default'),
  });

  const saveFlowDataMutation = useMutation({
    mutationFn: async ({ id, flowData }: { id: string; flowData: any }) => {
      const response = await automationApi.updateFlow(id, { flowData });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      setEditingFlow(null);
      toast.success('Flow saved successfully!');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to save flow'),
  });

  const cloneMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await automationApi.cloneTemplate(templateId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      toast.success('Template cloned to your flows');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to clone template'),
  });

  // ============================================
  // Render
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Chatbot Flows</h1>
          <p className="text-ios-secondary mt-1">Build automated WhatsApp conversation flows with a visual editor</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowKnowledgeBases(true)}
            className="btn-apple flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Database className="w-4 h-4" />
            Knowledge Bases
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-apple btn-wa-green flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Flow
          </button>
        </div>
      </div>

      {/* Stats */}
      {botFlows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Flows', value: botFlows.length },
            { label: 'Active Flows', value: botFlows.filter(f => f.isActive).length },
            { label: 'Total Executions', value: botFlows.reduce((a, f) => a + (f._count?.executions || 0), 0) },
          ].map((s, i) => (
            <div key={i} className="card-apple p-4">
              <p className="text-xs text-ios-muted uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold text-ios-dark mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Flow List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-apple p-6 animate-pulse">
              <div className="h-5 bg-ios-gray rounded w-1/2 mb-3" />
              <div className="h-4 bg-ios-gray rounded w-3/4 mb-4" />
              <div className="h-4 bg-ios-gray rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : botFlows.length === 0 ? (
        <div className="card-apple p-12 text-center">
          <MessageSquare className="w-12 h-12 text-ios-muted mx-auto mb-4" />
          <p className="text-ios-secondary font-medium">No chatbot flows yet</p>
          <p className="text-sm text-ios-muted mt-1">Create your first automated conversation flow or start from a template</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 text-wa-green hover:text-wa-green/80 font-medium">
            Create your first flow →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {botFlows.map((flow) => (
            <div key={flow.id} className="card-apple p-5 flex flex-col">
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-apple-lg flex items-center justify-center ${
                    flow.isActive ? 'bg-apple-green/20 text-apple-green' : 'bg-ios-gray text-ios-muted'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-ios-dark text-sm leading-tight">{flow.name}</p>
                    {flow.isDefault && (
                      <span className="text-[10px] font-semibold text-wa-green uppercase tracking-wide">Default</span>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-xs rounded-apple-full font-medium ${
                  flow.isActive ? 'bg-apple-green/20 text-apple-green' : 'bg-ios-gray text-ios-muted'
                }`}>
                  {flow.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Description */}
              {flow.description && (
                <p className="text-sm text-ios-secondary mb-3 line-clamp-2">{flow.description}</p>
              )}

              {/* Step count */}
              <div className="flex items-center gap-3 text-xs text-ios-muted mb-2">
                <span>{flow.flowData?.steps?.length || 0} steps</span>
                {flow._count?.executions != null && <span>·</span>}
                {flow._count?.executions != null && <span>{flow._count.executions} executions</span>}
                <span>·</span>
                <span>{new Date(flow.updatedAt).toLocaleDateString()}</span>
              </div>

              {/* Warning: active but will never actually trigger */}
              {flow.isActive && !flow.isDefault && (!flow.phoneNumberIds || flow.phoneNumberIds.length === 0) && (
                <div className="flex items-start gap-1.5 mb-3 p-2 bg-apple-orange/10 rounded-apple-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-apple-orange shrink-0 mt-0.5" />
                  <p className="text-xs text-apple-orange">
                    Active, but not set as default and not tied to a number — it will never actually trigger. Click the star to make it the default.
                  </p>
                </div>
              )}

              {/* Which number(s) this flow applies to — only relevant once
                  there's more than one connected number to choose between */}
              {phoneNumbers.length > 1 && (
                <div className="flex items-center justify-between gap-2 mb-3 text-xs">
                  <span className="text-ios-muted">
                    {flow.phoneNumberIds && flow.phoneNumberIds.length > 0
                      ? `${flow.phoneNumberIds.length} number${flow.phoneNumberIds.length > 1 ? 's' : ''} assigned`
                      : 'All numbers (via default)'}
                  </span>
                  <button
                    onClick={() => setAssigningNumbersFlow(flow)}
                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    <Phone className="w-3 h-3" /> Assign
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => setEditingFlow(flow)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-ios-gray text-ios-secondary rounded-apple-lg hover:bg-wa-green/10 hover:text-wa-green transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Edit Flow
                </button>
                {!flow.isDefault && (
                  <button
                    onClick={() => setDefaultMutation.mutate(flow.id)}
                    disabled={setDefaultMutation.isPending}
                    className="px-3 py-2 rounded-apple-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                    title="Set as default flow"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => toggleMutation.mutate({ id: flow.id, isActive: !flow.isActive })}
                  disabled={toggleMutation.isPending}
                  className={`px-3 py-2 rounded-apple-lg text-xs font-medium transition-colors ${
                    flow.isActive
                      ? 'bg-apple-orange/10 text-apple-orange hover:bg-apple-orange/20'
                      : 'bg-apple-green/10 text-apple-green hover:bg-apple-green/20'
                  }`}
                  title={flow.isActive ? 'Deactivate' : 'Activate'}
                >
                  {flow.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setConfirmDeleteFlow(flow)}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-2 rounded-apple-lg text-xs text-apple-red bg-apple-red/5 hover:bg-apple-red/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDeleteFlow && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-apple-red/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-apple-red" />
              </div>
              <h3 className="text-lg font-semibold text-ios-dark">Delete flow?</h3>
            </div>
            <p className="text-sm text-ios-secondary mb-5">
              "{confirmDeleteFlow.name}" will be permanently removed. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  deleteMutation.mutate(confirmDeleteFlow.id);
                  setConfirmDeleteFlow(null);
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 btn-apple bg-apple-red text-white hover:bg-apple-red/90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDeleteFlow(null)} className="flex-1 btn-apple btn-apple-outline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates Section */}
      {(templates.length > 0 || aiStatus?.available) && (
        <div>
          <h2 className="text-lg font-semibold text-ios-dark mb-3">Start from a Template</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiStatus?.available && (
              <button
                onClick={() => setShowAISuggest(true)}
                className="card-apple p-4 border border-dashed border-wa-green/30 bg-wa-green/5 text-left hover:bg-wa-green/10 transition-colors"
              >
                <p className="font-medium text-ios-dark text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-wa-green" />
                  Describe your flow
                </p>
                <p className="text-xs text-ios-muted mt-1 mb-3">Let AI design a starting flow from a plain-language description</p>
                <span className="flex items-center gap-1.5 text-xs text-wa-green font-medium">
                  Try it
                </span>
              </button>
            )}
            {templates.map((tpl: any) => (
              <div key={tpl.id} className="card-apple p-4 border border-dashed border-black/10">
                <p className="font-medium text-ios-dark text-sm">{tpl.name}</p>
                <p className="text-xs text-ios-muted mt-1 mb-3">{tpl.description}</p>
                <button
                  onClick={() => cloneMutation.mutate(tpl.id)}
                  disabled={cloneMutation.isPending}
                  className="flex items-center gap-1.5 text-xs text-wa-green font-medium hover:underline"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Use template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card p-6 w-[480px] shadow-apple-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-ios-dark">Create Chatbot Flow</h3>
                <p className="text-sm text-ios-muted mt-0.5">You can add steps in the visual editor after creating</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-ios-gray rounded-apple-lg transition">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Flow Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Welcome Bot, Support Flow"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-apple w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Description</label>
                <textarea
                  placeholder="What does this flow do?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="input-apple w-full resize-none"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                  className="w-4 h-4 accent-wa-green"
                />
                <span className="text-sm text-ios-secondary">Set as default flow (used when no phone number is matched)</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => createMutation.mutate(form)}
                  disabled={!form.name.trim() || createMutation.isPending}
                  className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create & Edit Flow'}
                </button>
                <button onClick={() => setShowCreate(false)} className="flex-1 btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Flow Suggest Modal */}
      {showAISuggest && (
        <FlowAISuggestModal
          onClose={() => setShowAISuggest(false)}
          onCreated={(flow) => {
            queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
            setEditingFlow(flow);
          }}
        />
      )}

      {/* Visual Flow Builder */}
      {editingFlow && (
        <FlowBuilder
          flowName={editingFlow.name}
          flowData={editingFlow.flowData || { steps: [], variables: [] }}
          onClose={() => setEditingFlow(null)}
          onSave={(flowData) => saveFlowDataMutation.mutate({ id: editingFlow.id, flowData })}
          isSaving={saveFlowDataMutation.isPending}
        />
      )}

      {showKnowledgeBases && <KnowledgeBaseModal onClose={() => setShowKnowledgeBases(false)} />}

      {/* Assign Numbers Modal — lets a tenant with multiple connected
          numbers scope a flow to specific ones instead of it silently
          applying tenant-wide (or never triggering at all). */}
      {assigningNumbersFlow && (
        <AssignNumbersModal
          flow={assigningNumbersFlow}
          phoneNumbers={phoneNumbers}
          onClose={() => setAssigningNumbersFlow(null)}
          onSave={(phoneNumberIds) => setPhoneNumbersMutation.mutate({ id: assigningNumbersFlow.id, phoneNumberIds })}
          isSaving={setPhoneNumbersMutation.isPending}
        />
      )}
    </div>
  );
}

function AssignNumbersModal({
  flow,
  phoneNumbers,
  onClose,
  onSave,
  isSaving,
}: {
  flow: BotFlow;
  phoneNumbers: { id: string; phoneNumber: string; displayName?: string }[];
  onClose: () => void;
  onSave: (phoneNumberIds: string[]) => void;
  isSaving: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(flow.phoneNumberIds || []);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-apple-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-ios-dark">Assign Numbers</h3>
          <button onClick={onClose} className="p-1 hover:bg-ios-gray rounded-apple-lg transition-colors">
            <X className="w-4 h-4 text-ios-muted" />
          </button>
        </div>
        <p className="text-sm text-ios-secondary mb-4">
          Which connected number(s) should "{flow.name}" respond on? Leave none checked to fall back to this flow only if it's set as the tenant's default.
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto mb-5">
          {phoneNumbers.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-apple-lg hover:bg-ios-gray/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
                className="w-4 h-4 accent-wa-green"
              />
              <div className="min-w-0">
                <p className="text-sm text-ios-dark truncate">{p.displayName || p.phoneNumber}</p>
                <p className="text-xs text-ios-muted font-mono truncate">{p.phoneNumber}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-ios-secondary hover:text-ios-dark border border-black/10 rounded-apple-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selected)}
            disabled={isSaving}
            className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
