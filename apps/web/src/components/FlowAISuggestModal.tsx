import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, X } from 'lucide-react';
import { api, automationApi } from '../api/client';

interface Props {
  onClose: () => void;
  onCreated: (flow: any) => void;
}

export default function FlowAISuggestModal({ onClose, onCreated }: Props) {
  const [intent, setIntent] = useState('');

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/automation/flows/suggest', { intent });
      return response.data.data as { steps: any[]; variables: any[]; rationale: string } | null;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (flowData: { steps: any[]; variables: any[] }) => {
      const response = await automationApi.createFlow({
        name: intent.slice(0, 60),
        description: `Generated from: "${intent}"`,
        flowData,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.data) onCreated(data.data);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
      <div className="glass-card p-6 w-[480px] shadow-apple-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-wa-green" />
            <h3 className="font-semibold text-ios-dark">Describe your flow</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ios-gray rounded-apple-lg transition">
            <X className="w-5 h-5 text-ios-muted" />
          </button>
        </div>

        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="e.g. handle refund requests and escalate angry customers to a human agent"
          rows={3}
          className="input-apple w-full resize-none"
        />

        {!suggestMutation.data && (
          <button
            onClick={() => suggestMutation.mutate()}
            disabled={!intent.trim() || suggestMutation.isPending}
            className="btn-apple btn-wa-green w-full mt-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {suggestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {suggestMutation.isPending ? 'Designing your flow...' : 'Generate flow'}
          </button>
        )}

        {suggestMutation.isSuccess && !suggestMutation.data && (
          <p className="text-sm text-apple-red mt-3">Couldn't generate a flow from that description — try rephrasing, or build one manually.</p>
        )}

        {suggestMutation.data && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-ios-muted">{suggestMutation.data.rationale}</p>
            <div className="bg-ios-gray/50 rounded-apple-lg p-3 space-y-1.5 max-h-64 overflow-y-auto">
              {suggestMutation.data.steps.map((step, i) => (
                <div key={step.id} className="text-xs text-ios-dark flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-wa-green/20 text-wa-green flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-medium">{step.type}</span>
                  {step.label && <span className="text-ios-muted">— {step.label}</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createMutation.mutate({ steps: suggestMutation.data!.steps, variables: suggestMutation.data!.variables })}
                disabled={createMutation.isPending}
                className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create this flow'}
              </button>
              <button onClick={() => suggestMutation.reset()} className="flex-1 btn-apple btn-apple-outline">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
