import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { MessageSquare, Plus, X, Play, Pause, Trash2 } from 'lucide-react';

interface BotFlow {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function BotFlowsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<BotFlow | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bot-flows'],
    queryFn: async () => {
      const response = await api.get('/chatbot/flows');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const response = await api.post('/chatbot/flows', {
        name: payload.name,
        description: payload.description,
        flowData: { nodes: [], edges: [] },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      setShowCreate(false);
      setForm({ name: '', description: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/chatbot/flows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
      setSelectedFlow(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/chatbot/flows/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-flows'] });
    },
  });

  const flows: BotFlow[] = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Chatbot Flows</h1>
          <p className="text-ios-secondary mt-1">Create automated conversation flows</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-apple btn-wa-green flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Flow
        </button>
      </div>

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
      ) : flows.length === 0 ? (
        <div className="card-apple p-12 text-center">
          <MessageSquare className="w-12 h-12 text-ios-muted mx-auto mb-4" />
          <p className="text-ios-secondary">No chatbot flows yet</p>
          <p className="text-sm text-ios-muted mt-1">Create your first automated conversation flow</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 text-wa-green hover:text-wa-green/80">
            Create a flow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {flows.map((flow) => (
            <div
              key={flow.id}
              onClick={() => setSelectedFlow(flow)}
              className="card-apple p-5 cursor-pointer hover:shadow-apple-hover transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-apple-lg flex items-center justify-center ${
                    flow.isActive ? 'bg-apple-green/20 text-apple-green' : 'bg-ios-gray text-ios-muted'
                  }`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-ios-dark">{flow.name}</span>
                </div>
                <span className={`px-2 py-0.5 text-xs rounded-apple-full ${
                  flow.isActive ? 'bg-apple-green/20 text-apple-green' : 'bg-ios-gray text-ios-muted'
                }`}>
                  {flow.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {flow.description && (
                <p className="text-sm text-ios-secondary mb-3">{flow.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-ios-muted">
                <span>{flow.isActive ? 'Automated' : 'Paused'}</span>
                <span>{new Date(flow.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card p-6 w-[480px] shadow-apple-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ios-dark">Create Chatbot Flow</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-ios-gray rounded-apple-lg transition">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Flow Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Welcome Bot"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-apple w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Description</label>
                <textarea
                  placeholder="Describe what this flow does..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="input-apple w-full resize-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => createMutation.mutate(form)}
                  disabled={!form.name.trim() || createMutation.isPending}
                  className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Flow'}
                </button>
                <button onClick={() => setShowCreate(false)} className="flex-1 btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flow Detail Modal */}
      {selectedFlow && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="glass-card p-6 w-[480px] shadow-apple-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ios-dark">{selectedFlow.name}</h3>
              <button onClick={() => setSelectedFlow(null)} className="p-1 hover:bg-ios-gray rounded-apple-lg transition">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ios-muted">Status</span>
                <span className={`font-medium ${selectedFlow.isActive ? 'text-apple-green' : 'text-ios-muted'}`}>
                  {selectedFlow.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {selectedFlow.description && (
                <div>
                  <span className="text-ios-muted block mb-1">Description</span>
                  <p className="text-ios-secondary">{selectedFlow.description}</p>
                </div>
              )}
              <div className="flex justify-between text-xs text-ios-muted pt-2">
                <span>Created {new Date(selectedFlow.createdAt).toLocaleDateString()}</span>
                <span>Updated {new Date(selectedFlow.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-black/5">
              <button
                onClick={() => toggleMutation.mutate({ id: selectedFlow.id, isActive: !selectedFlow.isActive })}
                disabled={toggleMutation.isPending}
                className={`flex-1 rounded-apple-lg border ${
                  selectedFlow.isActive
                    ? 'border-apple-orange/30 text-apple-orange hover:bg-apple-orange/10'
                    : 'border-apple-green/30 text-apple-green hover:bg-apple-green/10'
                }`}
              >
                {selectedFlow.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${selectedFlow.name}"?`)) deleteMutation.mutate(selectedFlow.id);
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 border border-apple-red/30 text-apple-red rounded-apple-lg hover:bg-apple-red/10 disabled:opacity-50"
              >
                Delete
              </button>
              <button onClick={() => setSelectedFlow(null)} className="flex-1 btn-apple btn-apple-outline">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
