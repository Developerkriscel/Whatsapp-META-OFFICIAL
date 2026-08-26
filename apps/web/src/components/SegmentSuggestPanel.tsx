import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAIStatus } from '../hooks/useAIStatus';

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface Props {
  onApply: (matchType: 'all' | 'any', conditions: Condition[]) => void;
}

export default function SegmentSuggestPanel({ onApply }: Props) {
  const { data: aiStatus } = useAIStatus();
  const [goal, setGoal] = useState('');

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/segments/suggest', { goal });
      return response.data.data as {
        conditions: Condition[];
        matchType: 'all' | 'any';
        estimatedCount: number;
        rationale: string;
      } | null;
    },
  });

  if (!aiStatus?.available) return null;

  return (
    <div className="bg-ios-gray/50 rounded-apple-lg p-3 space-y-2">
      <label className="block text-xs font-medium text-ios-secondary">Describe who you want to target</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. customers who haven't messaged in 30 days"
          className="input-apple flex-1 text-sm"
        />
        <button
          type="button"
          onClick={() => suggestMutation.mutate()}
          disabled={!goal.trim() || suggestMutation.isPending}
          className="btn-apple btn-apple-outline flex items-center gap-1.5 px-3 disabled:opacity-50"
        >
          {suggestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Suggest
        </button>
      </div>

      {suggestMutation.data && suggestMutation.data.conditions.length > 0 && (
        <div className="bg-white rounded-apple-lg p-2.5">
          <p className="text-xs text-ios-dark">
            Matches an estimated <strong>{suggestMutation.data.estimatedCount}</strong> contact
            {suggestMutation.data.estimatedCount === 1 ? '' : 's'}
          </p>
          <p className="text-[11px] text-ios-muted mt-0.5">{suggestMutation.data.rationale}</p>
          <button
            type="button"
            onClick={() => onApply(suggestMutation.data!.matchType, suggestMutation.data!.conditions)}
            className="text-xs font-medium text-wa-green mt-1.5 hover:underline"
          >
            Use these conditions
          </button>
        </div>
      )}
      {suggestMutation.isSuccess && (!suggestMutation.data || suggestMutation.data.conditions.length === 0) && (
        <p className="text-xs text-ios-muted">Couldn't build a segment from that — try describing it differently.</p>
      )}
    </div>
  );
}
