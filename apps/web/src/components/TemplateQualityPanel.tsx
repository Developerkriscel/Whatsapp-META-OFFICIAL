import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useAIStatus } from '../hooks/useAIStatus';

interface Issue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  field: string;
}

interface Props {
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  bodyText: string;
  headerText?: string;
  footerText?: string;
  onResult?: (ok: boolean) => void;
  onApplySuggestion: (newBodyText: string) => void;
}

export default function TemplateQualityPanel({ category, bodyText, headerText, footerText, onResult, onApplySuggestion }: Props) {
  const debouncedBody = useDebouncedValue(bodyText, 500);
  const { data: aiStatus } = useAIStatus();

  const { data, isFetching } = useQuery({
    queryKey: ['template-analyze', category, debouncedBody, headerText, footerText],
    queryFn: async () => {
      const response = await api.post('/templates/analyze', { category, bodyText: debouncedBody, headerText, footerText });
      return response.data.data as { ok: boolean; score: number; issues: Issue[] };
    },
    enabled: debouncedBody.trim().length > 0,
  });

  useEffect(() => {
    if (data) onResult?.(data.ok);
  }, [data, onResult]);

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/templates/ai-rewrite', {
        category,
        bodyText,
        issues: data?.issues ?? [],
      });
      return response.data.data as { suggestion: string; rationale: string } | null;
    },
  });

  if (!debouncedBody.trim()) return null;

  return (
    <div className="mt-2 space-y-2">
      {isFetching && !data && (
        <p className="text-xs text-ios-muted flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking against Meta's template policy...
        </p>
      )}

      {data && (
        <div className={`rounded-apple-lg p-3 text-sm ${data.ok ? 'bg-apple-green/10' : 'bg-apple-red/5'}`}>
          <div className="flex items-center gap-2 mb-1.5">
            {data.ok ? (
              <CheckCircle2 className="w-4 h-4 text-apple-green flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-apple-red flex-shrink-0" />
            )}
            <span className={`font-medium ${data.ok ? 'text-apple-green' : 'text-apple-red'}`}>
              {data.ok ? 'Looks good — unlikely to be rejected' : 'Would likely be rejected by Meta'}
            </span>
            <span className="text-xs text-ios-muted ml-auto">Score: {data.score}/100</span>
          </div>

          {data.issues.length > 0 && (
            <ul className="space-y-1 ml-6 list-disc">
              {data.issues.map((issue) => (
                <li
                  key={issue.code}
                  className={`text-xs ${issue.severity === 'error' ? 'text-apple-red' : 'text-apple-orange'}`}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          {!data.ok && aiStatus?.available && (
            <div className="mt-2 pt-2 border-t border-black/5">
              {!rewriteMutation.data && (
                <button
                  type="button"
                  onClick={() => rewriteMutation.mutate()}
                  disabled={rewriteMutation.isPending}
                  className="text-xs font-medium text-wa-green flex items-center gap-1.5 hover:underline disabled:opacity-50"
                >
                  {rewriteMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {rewriteMutation.isPending ? 'Asking AI to fix this...' : 'Get AI rewrite suggestion'}
                </button>
              )}

              {rewriteMutation.data && (
                <div className="bg-white rounded-apple-lg p-2.5 mt-1">
                  <p className="text-xs text-ios-dark">{rewriteMutation.data.suggestion}</p>
                  <p className="text-[11px] text-ios-muted mt-1">{rewriteMutation.data.rationale}</p>
                  <button
                    type="button"
                    onClick={() => onApplySuggestion(rewriteMutation.data!.suggestion)}
                    className="text-xs font-medium text-wa-green mt-1.5 hover:underline"
                  >
                    Apply this suggestion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
