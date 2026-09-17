/**
 * Which model answers.
 *
 * Provider and key were environment variables, so switching between Mistral and
 * OpenAI meant editing .env and redeploying. Both are settings now.
 *
 * The panel deliberately separates "a key is stored" from "the key works" — the
 * two are not the same claim, and only a real request can make the second. Test
 * sends one.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Sparkles, Check, Loader2, AlertTriangle, ExternalLink, KeyRound, Play,
} from 'lucide-react';

interface ProviderRow {
  provider: 'mistral' | 'openai';
  label: string;
  chatModel: string;
  embedModel: string;
  embedDimensions: number;
  hasKey: boolean;
  keySource: 'stored' | 'environment' | 'none';
  keysUrl: string;
}

interface AiStatus {
  active: 'mistral' | 'openai';
  providers: ProviderRow[];
  knowledge: { total: number; stale: number; expectedDimensions: number } | null;
}

export default function SuperAdminAiTab() {
  const qc = useQueryClient();
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [modelDraft, setModelDraft] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: async () => (await api.get('/superadmin/ai')).data?.data as AiStatus,
  });

  const save = useMutation({
    mutationFn: async (body: any) => (await api.patch('/superadmin/ai', body)).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  });

  const test = useMutation({
    mutationFn: async (provider: string) =>
      ({ provider, ...(await api.post('/superadmin/ai/test', { provider })).data?.data }),
    onSuccess: (r: any) => setTestResult((s) => ({ ...s, [r.provider]: { ok: r.ok, detail: r.detail } })),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-7 h-7 animate-spin text-wa-green" />
      </div>
    );
  }

  const activeRow = data.providers.find((p) => p.provider === data.active);

  return (
    <div className="space-y-5">
      {/* Switching provider changes the embedding model too, and vectors from
          two models cannot be compared. Say so before it looks like amnesia. */}
      {data.knowledge && data.knowledge.stale > 0 && (
        <div className="card-apple p-4 border border-apple-orange/30 bg-apple-orange/5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-apple-orange shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-ios-dark">
              {data.knowledge.stale.toLocaleString('en-IN')} of {data.knowledge.total.toLocaleString('en-IN')}{' '}
              knowledge-base chunks were indexed by a different model.
            </p>
            <p className="text-ios-secondary mt-1">
              {activeRow?.label} produces {data.knowledge.expectedDimensions}-dimension vectors, and vectors
              from two models cannot be compared — those chunks are invisible to search until their documents
              are re-uploaded. Chatbot answers drawn from them will come back as &ldquo;not sure&rdquo;.
            </p>
          </div>
        </div>
      )}

      <div className="card-apple p-5">
        <h3 className="font-semibold text-ios-dark inline-flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-ios-muted" /> AI provider
        </h3>
        <p className="text-xs text-ios-muted mt-1 max-w-2xl">
          Used for template rewrites, campaign copy, segment and flow suggestions, and chatbot replies.
          Everything degrades to the rule engine or a static message when no provider answers.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {data.providers.map((p) => {
            const isActive = p.provider === data.active;
            const result = testResult[p.provider];
            return (
              <div
                key={p.provider}
                className={`rounded-apple-lg border p-4 transition ${
                  isActive ? 'border-wa-green bg-wa-green/5' : 'border-black/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ios-dark">{p.label}</p>
                    {isActive && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-wa-green text-white">Active</span>
                    )}
                  </div>
                  {!isActive && (
                    <button
                      onClick={() => save.mutate({ provider: p.provider })}
                      disabled={!p.hasKey || save.isPending}
                      title={p.hasKey ? '' : 'Add an API key first'}
                      className="text-xs text-wa-green font-medium hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      Use {p.label}
                    </button>
                  )}
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ios-muted">API key</dt>
                    <dd className={p.hasKey ? 'text-ios-dark' : 'text-apple-red'}>
                      {p.keySource === 'stored'
                        ? 'Stored'
                        : p.keySource === 'environment'
                          ? 'From environment'
                          : 'Not set'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ios-muted">Embeddings</dt>
                    <dd className="text-ios-secondary">
                      {p.embedModel} · {p.embedDimensions}d
                    </dd>
                  </div>
                </dl>

                <label className="block mt-3">
                  <span className="block text-xs font-medium text-ios-secondary mb-1">Chat model</span>
                  <div className="flex gap-2">
                    <input
                      value={modelDraft[p.provider] ?? p.chatModel}
                      onChange={(e) => setModelDraft((s) => ({ ...s, [p.provider]: e.target.value }))}
                      className="input-apple flex-1 text-sm"
                    />
                    {(modelDraft[p.provider] ?? p.chatModel) !== p.chatModel && (
                      <button
                        onClick={() =>
                          save.mutate({ forProvider: p.provider, chatModel: modelDraft[p.provider] })
                        }
                        className="btn-apple btn-wa-green text-xs px-3"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </label>

                <label className="block mt-3">
                  <span className="block text-xs font-medium text-ios-secondary mb-1 inline-flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Replace API key
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={p.hasKey ? '•••••••• (stored)' : 'Paste a key'}
                      value={keyDraft[p.provider] ?? ''}
                      onChange={(e) => setKeyDraft((s) => ({ ...s, [p.provider]: e.target.value }))}
                      className="input-apple flex-1 text-sm"
                    />
                    <button
                      onClick={() => {
                        save.mutate({ forProvider: p.provider, apiKey: keyDraft[p.provider] });
                        setKeyDraft((s) => ({ ...s, [p.provider]: '' }));
                      }}
                      disabled={!keyDraft[p.provider] || keyDraft[p.provider].length < 10 || save.isPending}
                      className="btn-apple btn-wa-green text-xs px-3 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </label>

                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={() => test.mutate(p.provider)}
                    disabled={!p.hasKey || test.isPending}
                    className="btn-apple btn-apple-outline text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {test.isPending && test.variables === p.provider ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    Test
                  </button>
                  <a
                    href={p.keysUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-ios-muted hover:text-ios-dark inline-flex items-center gap-1"
                  >
                    Get a key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {result && (
                  <p
                    className={`text-xs mt-2 inline-flex items-start gap-1.5 ${
                      result.ok ? 'text-wa-green' : 'text-apple-red'
                    }`}
                  >
                    {result.ok ? (
                      <Check className="w-3.5 h-3.5 mt-px shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    )}
                    <span>{result.detail}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {save.isError && (
          <p className="text-xs text-apple-red mt-3">
            {(save.error as any)?.response?.data?.error?.message || 'Could not save'}
          </p>
        )}
      </div>
    </div>
  );
}
