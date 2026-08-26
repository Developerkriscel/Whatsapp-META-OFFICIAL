import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, X } from 'lucide-react';
import { api } from '../api/client';
import { useAIStatus } from '../hooks/useAIStatus';

interface Props {
  audienceDescription: string;
  existingText: string;
  onApply: (message: string) => void;
}

export default function CampaignMessageSuggest({ audienceDescription, existingText, onApply }: Props) {
  const { data: aiStatus } = useAIStatus();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState('');

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/campaigns/message-suggest', {
        goal,
        audienceDescription,
        existingText,
      });
      return response.data.data as { suggestion: string; rationale: string } | null;
    },
  });

  if (!aiStatus?.available) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-wa-green hover:text-wa-teal transition"
      >
        <Sparkles className="w-4 h-4" />
        Suggest message
      </button>

      {open && (
        <div className="bg-ios-gray/50 rounded-apple-lg p-3 mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-ios-secondary">What's this message for?</p>
            <button type="button" onClick={() => setOpen(false)} className="p-0.5 hover:bg-ios-gray rounded transition">
              <X className="w-3.5 h-3.5 text-ios-muted" />
            </button>
          </div>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. announce a weekend sale"
            className="input-apple w-full text-sm"
          />
          <button
            type="button"
            onClick={() => suggestMutation.mutate()}
            disabled={!goal.trim() || suggestMutation.isPending}
            className="text-xs font-medium text-wa-green flex items-center gap-1.5 hover:underline disabled:opacity-50"
          >
            {suggestMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {suggestMutation.isPending ? 'Writing...' : 'Generate'}
          </button>

          {suggestMutation.data && (
            <div className="bg-white rounded-apple-lg p-2.5">
              <p className="text-xs text-ios-dark whitespace-pre-wrap">{suggestMutation.data.suggestion}</p>
              <button
                type="button"
                onClick={() => {
                  onApply(suggestMutation.data!.suggestion);
                  setOpen(false);
                }}
                className="text-xs font-medium text-wa-green mt-1.5 hover:underline"
              >
                Use this message
              </button>
            </div>
          )}
          {suggestMutation.isSuccess && !suggestMutation.data && (
            <p className="text-xs text-ios-muted">Couldn't generate a suggestion right now — try rephrasing.</p>
          )}
        </div>
      )}
    </div>
  );
}
