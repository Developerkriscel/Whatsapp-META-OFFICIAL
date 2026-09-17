/**
 * AI manager.
 *
 * Provider and key were environment variables, and nothing recorded what AI
 * cost or who spent it — so "which workspace is burning the budget" had no
 * answer, and there was no basis on which to limit anything.
 *
 * Four things live here, in the order you need them: whether AI is on and what
 * it has cost this month, which model answers, what anyone is allowed to
 * spend, and who actually spent it.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Sparkles, Check, Loader2, AlertTriangle, ExternalLink, KeyRound, Play,
  Power, Gauge, BarChart3, RotateCcw, Ban,
} from 'lucide-react';

type ProviderId = 'mistral' | 'openai';

interface ProviderRow {
  provider: ProviderId;
  label: string;
  chatModel: string;
  embedModel: string;
  embedDimensions: number;
  hasKey: boolean;
  keySource: 'stored' | 'environment' | 'none';
  keysUrl: string;
}

interface Limits {
  enabled: boolean;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  requestsPerMinute: number;
  monthlyBudget: number;
  prices: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
}

interface AiStatus {
  active: ProviderId;
  providers: ProviderRow[];
  limits: Limits;
  defaults: Limits;
  knowledge: { total: number; stale: number; expectedDimensions: number } | null;
  thisMonth: { calls: number; tokens: number; spend: number; budget: number };
}

interface Usage {
  days: number;
  totals: {
    calls: number; failed: number; promptTokens: number; completionTokens: number;
    tokens: number; spend: number; avgLatencyMs: number;
  };
  byTenant: Array<{
    tenantId: string | null; name: string; calls: number; tokens: number; spend: number;
    effectiveDaily: number | null; enabled: boolean;
    policy: { dailyTokenLimit: number | null; requestsPerMinute: number | null } | null;
  }>;
  byModel: Array<{ model: string; calls: number; tokens: number; spend: number }>;
  byFeature: Array<{ feature: string; calls: number; tokens: number; spend: number }>;
  errors: Array<{ code: string; count: number }>;
}

const n = (v: number) => v.toLocaleString('en-IN');
const money = (v: number) => '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FEATURE_LABEL: Record<string, string> = {
  template: 'Template rewrites',
  campaign: 'Campaign copy',
  segment: 'Segment filters',
  flow: 'Chatbot flow design',
  chatbot: 'Chatbot replies',
  'chatbot-rag': 'Chatbot replies (knowledge base)',
  unknown: 'Unattributed',
};

/** Why a call was refused, in the words of whoever reads this panel. */
const ERROR_LABEL: Record<string, string> = {
  AI_DISABLED: 'Blocked — AI switched off',
  TENANT_DISABLED: 'Blocked — workspace switched off',
  RATE_LIMITED: 'Blocked — too many requests',
  DAILY_TOKENS: 'Blocked — daily tokens spent',
  MONTHLY_TOKENS: 'Blocked — monthly tokens spent',
  BUDGET: 'Blocked — platform budget spent',
  EMPTY_RESPONSE: 'Model returned nothing',
  TIMEOUT: 'Timed out',
  NETWORK: 'Network failure',
};

export default function SuperAdminAiTab() {
  const qc = useQueryClient();
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail: string }>>({});
  const [limitDraft, setLimitDraft] = useState<Partial<Limits> | null>(null);
  const [days, setDays] = useState(30);
  const [modelsFor, setModelsFor] = useState<ProviderId | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: async () => (await api.get('/superadmin/ai')).data?.data as AiStatus,
  });

  const { data: usage } = useQuery({
    queryKey: ['ai-usage', days],
    queryFn: async () => (await api.get(`/superadmin/ai/usage?days=${days}`)).data?.data as Usage,
    refetchInterval: 60000,
  });

  const { data: models } = useQuery({
    queryKey: ['ai-models', modelsFor],
    queryFn: async () =>
      (await api.get(`/superadmin/ai/models?provider=${modelsFor}`)).data?.data as
        { provider: ProviderId; models: string[]; error?: string },
    enabled: !!modelsFor,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ai-settings'] });
    qc.invalidateQueries({ queryKey: ['ai-usage'] });
  };

  const save = useMutation({
    mutationFn: async (body: any) => (await api.patch('/superadmin/ai', body)).data?.data,
    onSuccess: invalidate,
  });

  const saveLimits = useMutation({
    mutationFn: async (body: any) => (await api.patch('/superadmin/ai/limits', body)).data?.data,
    onSuccess: () => { setLimitDraft(null); invalidate(); },
  });

  const savePolicy = useMutation({
    mutationFn: async ({ tenantId, ...body }: any) =>
      (await api.put(`/superadmin/ai/policy/${tenantId}`, body)).data?.data,
    onSuccess: invalidate,
  });

  const resetPolicy = useMutation({
    mutationFn: async (tenantId: string) =>
      (await api.delete(`/superadmin/ai/policy/${tenantId}`)).data?.data,
    onSuccess: invalidate,
  });

  const test = useMutation({
    mutationFn: async (provider: string) =>
      ({ provider, ...(await api.post('/superadmin/ai/test', { provider })).data?.data }),
    onSuccess: (r: any) => { setTestResult((s) => ({ ...s, [r.provider]: { ok: r.ok, detail: r.detail } })); invalidate(); },
  });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 animate-spin text-wa-green" /></div>;
  }

  const L = { ...data.limits, ...(limitDraft || {}) };
  const limitsDirty = limitDraft !== null;
  const activeRow = data.providers.find((p) => p.provider === data.active);
  const budgetPct = data.thisMonth.budget > 0
    ? Math.min(100, (data.thisMonth.spend / data.thisMonth.budget) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Off switch and this month's spend, first — they answer "is it on" and
          "what is it costing", which is why anyone opens this page. */}
      <div className="card-apple p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-ios-dark inline-flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-ios-muted" /> AI manager
            </h3>
            <p className="text-xs text-ios-muted mt-1 max-w-xl">
              Template rewrites, campaign copy, segment and flow suggestions, and chatbot replies.
              Every feature falls back to its rule engine or a static message when AI is off or refused.
            </p>
          </div>
          <button
            onClick={() => saveLimits.mutate({ enabled: !data.limits.enabled })}
            className={`btn-apple text-sm inline-flex items-center gap-1.5 ${
              data.limits.enabled ? 'btn-apple-outline' : 'btn-wa-green'
            }`}
          >
            <Power className="w-4 h-4" />
            {data.limits.enabled ? 'Turn AI off' : 'Turn AI on'}
          </button>
        </div>

        {!data.limits.enabled && (
          <div className="mt-3 p-3 rounded-apple-lg bg-apple-red/5 border border-apple-red/20 text-sm text-apple-red inline-flex items-start gap-2">
            <Ban className="w-4 h-4 mt-0.5 shrink-0" />
            AI is switched off platform-wide. No provider is being called.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Stat label="Calls this month" value={n(data.thisMonth.calls)} />
          <Stat label="Tokens this month" value={n(data.thisMonth.tokens)} />
          <Stat label="Spend this month" value={money(data.thisMonth.spend)} />
          <Stat
            label={data.thisMonth.budget > 0 ? `Budget ${money(data.thisMonth.budget)}` : 'Budget'}
            value={data.thisMonth.budget > 0 ? `${budgetPct.toFixed(0)}% used` : 'No cap'}
            warn={budgetPct >= 80}
          />
        </div>

        {data.thisMonth.budget > 0 && (
          <div className="mt-3 h-1.5 rounded-full bg-ios-gray overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${budgetPct >= 80 ? 'bg-apple-red' : 'bg-wa-green'}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        )}

        <p className="text-xs text-ios-muted mt-3">
          Spend is an estimate: neither vendor publishes prices through an API, so it is token counts
          multiplied by the rates entered below.
        </p>
      </div>

      {/* Provider switch changes the embedding model too. */}
      {data.knowledge && data.knowledge.stale > 0 && (
        <div className="card-apple p-4 border border-apple-orange/30 bg-apple-orange/5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-apple-orange shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-ios-dark">
              {n(data.knowledge.stale)} of {n(data.knowledge.total)} knowledge-base chunks were indexed by a
              different model.
            </p>
            <p className="text-ios-secondary mt-1">
              {activeRow?.label} produces {data.knowledge.expectedDimensions}-dimension vectors, and vectors
              from two models cannot be compared — those chunks are invisible to search until their documents
              are re-uploaded. Chatbot answers drawn from them will come back as &ldquo;not sure&rdquo;.
            </p>
          </div>
        </div>
      )}

      {/* Which model answers. */}
      <div className="card-apple p-5">
        <h3 className="font-semibold text-ios-dark">Provider and model</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {data.providers.map((p) => {
            const isActive = p.provider === data.active;
            const result = testResult[p.provider];
            const list = modelsFor === p.provider ? models : undefined;
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
                    {isActive && <span className="text-[11px] px-1.5 py-0.5 rounded bg-wa-green text-white">Active</span>}
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
                      {p.keySource === 'stored' ? 'Stored' : p.keySource === 'environment' ? 'From environment' : 'Not set'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ios-muted">Embeddings</dt>
                    <dd className="text-ios-secondary">{p.embedModel} · {p.embedDimensions}d</dd>
                  </div>
                </dl>

                {/* A dropdown of what the key can actually reach — a typed
                    model name 404s and every feature stops suggesting. */}
                <label className="block mt-3">
                  <span className="block text-xs font-medium text-ios-secondary mb-1">Chat model</span>
                  {list?.models?.length ? (
                    <select
                      value={p.chatModel}
                      onChange={(e) => save.mutate({ forProvider: p.provider, chatModel: e.target.value })}
                      className="input-apple w-full text-sm"
                    >
                      {!list.models.includes(p.chatModel) && <option value={p.chatModel}>{p.chatModel}</option>}
                      {list.models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input readOnly value={p.chatModel} className="input-apple flex-1 text-sm bg-ios-gray/50" />
                      <button
                        onClick={() => setModelsFor(p.provider)}
                        disabled={!p.hasKey}
                        className="btn-apple btn-apple-outline text-xs px-3 disabled:opacity-40"
                      >
                        {modelsFor === p.provider && !list ? '…' : 'Change'}
                      </button>
                    </div>
                  )}
                  {list?.error && <p className="text-xs text-apple-red mt-1">{list.error}</p>}
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
                    {test.isPending && test.variables === p.provider
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Play className="w-3 h-3" />}
                    Test
                  </button>
                  <a href={p.keysUrl} target="_blank" rel="noreferrer noopener"
                     className="text-xs text-ios-muted hover:text-ios-dark inline-flex items-center gap-1">
                    Get a key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {result && (
                  <p className={`text-xs mt-2 inline-flex items-start gap-1.5 ${result.ok ? 'text-wa-green' : 'text-apple-red'}`}>
                    {result.ok ? <Check className="w-3.5 h-3.5 mt-px shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />}
                    <span>{result.detail}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Limits. */}
      <div className="card-apple p-5">
        <h3 className="font-semibold text-ios-dark inline-flex items-center gap-2">
          <Gauge className="w-5 h-5 text-ios-muted" /> Default limits
        </h3>
        <p className="text-xs text-ios-muted mt-1">
          Applied to every workspace without its own override. Zero means no limit.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <NumField label="Requests / minute" value={L.requestsPerMinute}
            onChange={(v) => setLimitDraft({ ...limitDraft, requestsPerMinute: v })} />
          <NumField label="Tokens / day" value={L.dailyTokenLimit}
            onChange={(v) => setLimitDraft({ ...limitDraft, dailyTokenLimit: v })} />
          <NumField label="Tokens / month" value={L.monthlyTokenLimit}
            onChange={(v) => setLimitDraft({ ...limitDraft, monthlyTokenLimit: v })} />
          <NumField label="Platform budget / month (₹)" value={L.monthlyBudget}
            onChange={(v) => setLimitDraft({ ...limitDraft, monthlyBudget: v })} />
        </div>

        {limitsDirty && (
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => saveLimits.mutate(limitDraft)} disabled={saveLimits.isPending}
              className="btn-apple btn-wa-green text-sm disabled:opacity-50">
              {saveLimits.isPending ? 'Saving…' : 'Save limits'}
            </button>
            <button onClick={() => setLimitDraft(null)}
              className="btn-apple btn-apple-outline text-sm inline-flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Discard
            </button>
          </div>
        )}

        {/* Prices drive every cost figure, so they belong next to the budget
            they are measured against. */}
        <div className="mt-5">
          <p className="text-xs font-medium text-ios-secondary mb-2">
            Model prices — ₹ per million tokens
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ios-muted text-left border-b border-black/10">
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium text-right">Input</th>
                  <th className="py-2 font-medium text-right">Output</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(L.prices).map(([model, price]) => (
                  <tr key={model} className="border-b border-black/5 last:border-0">
                    <td className="py-2 pr-4 text-ios-dark">{model}</td>
                    <td className="py-2 pr-4 text-right">
                      <input type="number" min={0} step="1" value={price.inputPerMillion}
                        onChange={(e) => setLimitDraft({
                          ...limitDraft,
                          prices: { ...L.prices, [model]: { ...price, inputPerMillion: Number(e.target.value) } },
                        })}
                        className="input-apple w-24 text-sm text-right tabular-nums" />
                    </td>
                    <td className="py-2 text-right">
                      <input type="number" min={0} step="1" value={price.outputPerMillion}
                        onChange={(e) => setLimitDraft({
                          ...limitDraft,
                          prices: { ...L.prices, [model]: { ...price, outputPerMillion: Number(e.target.value) } },
                        })}
                        className="input-apple w-24 text-sm text-right tabular-nums" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Who spent it. */}
      <div className="card-apple p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-ios-dark inline-flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-ios-muted" /> Usage
          </h3>
          <div className="flex rounded-apple-lg border border-black/10 overflow-hidden text-xs">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 transition ${days === d ? 'bg-wa-green text-white' : 'text-ios-secondary hover:bg-ios-gray'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {!usage ? (
          <div className="flex items-center justify-center h-24"><Loader2 className="w-6 h-6 animate-spin text-wa-green" /></div>
        ) : usage.totals.calls === 0 ? (
          <p className="text-sm text-ios-muted mt-4">
            No AI calls in the last {days} days. Usage is recorded from now on — nothing before this
            was tracked.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
              <Stat label="Calls" value={n(usage.totals.calls)} />
              <Stat label="Failed / blocked" value={n(usage.totals.failed)} warn={usage.totals.failed > 0} />
              <Stat label="Tokens" value={n(usage.totals.tokens)} />
              <Stat label="Spend" value={money(usage.totals.spend)} />
              <Stat label="Avg latency" value={`${n(usage.totals.avgLatencyMs)}ms`} />
            </div>

            <div className="overflow-x-auto mt-5">
              <p className="text-xs font-medium text-ios-secondary mb-2">By workspace</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ios-muted text-left border-b border-black/10">
                    <th className="py-2 pr-4 font-medium">Workspace</th>
                    <th className="py-2 pr-4 font-medium text-right">Calls</th>
                    <th className="py-2 pr-4 font-medium text-right">Tokens</th>
                    <th className="py-2 pr-4 font-medium text-right">Spend</th>
                    <th className="py-2 pr-4 font-medium text-right">Daily cap</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {usage.byTenant.map((t) => (
                    <tr key={t.tenantId ?? 'platform'} className="border-b border-black/5 last:border-0">
                      <td className="py-2 pr-4">
                        <span className="text-ios-dark">{t.name}</span>
                        {!t.enabled && (
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-apple-red/15 text-apple-red">off</span>
                        )}
                        {t.policy && t.enabled && (
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-ios-gray text-ios-secondary">custom</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-ios-secondary">{n(t.calls)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-ios-dark">{n(t.tokens)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-ios-dark">{money(t.spend)}</td>
                      <td className="py-2 pr-4 text-right">
                        {t.tenantId ? (
                          <input
                            type="number" min={0}
                            defaultValue={t.effectiveDaily ?? 0}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== (t.effectiveDaily ?? 0)) {
                                savePolicy.mutate({ tenantId: t.tenantId, dailyTokenLimit: v });
                              }
                            }}
                            className="input-apple w-28 text-sm text-right tabular-nums"
                          />
                        ) : (
                          <span className="text-ios-muted">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {t.tenantId && (
                          <>
                            <button
                              onClick={() => savePolicy.mutate({ tenantId: t.tenantId, enabled: !t.enabled })}
                              className="text-xs text-ios-secondary hover:text-ios-dark"
                            >
                              {t.enabled ? 'Disable' : 'Enable'}
                            </button>
                            {t.policy && (
                              <button
                                onClick={() => resetPolicy.mutate(t.tenantId!)}
                                className="text-xs text-ios-muted hover:text-ios-dark ml-3"
                                title="Follow the platform default again"
                              >
                                Reset
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
              <Breakdown title="By model" rows={usage.byModel.map((m) => ({ label: m.model, calls: m.calls, spend: m.spend }))} />
              <Breakdown title="By feature" rows={usage.byFeature.map((f) => ({ label: FEATURE_LABEL[f.feature] || f.feature, calls: f.calls, spend: f.spend }))} />
              <div>
                <p className="text-xs font-medium text-ios-secondary mb-2">Failures and blocks</p>
                {usage.errors.length === 0 ? (
                  <p className="text-xs text-ios-muted">None.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {usage.errors.map((e) => (
                      <li key={e.code} className="flex justify-between gap-2 text-sm">
                        <span className="text-ios-secondary truncate">{ERROR_LABEL[e.code] || e.code}</span>
                        <span className="tabular-nums text-ios-dark">{n(e.count)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {(save.isError || saveLimits.isError || savePolicy.isError) && (
        <p className="text-xs text-apple-red">
          {((save.error || saveLimits.error || savePolicy.error) as any)?.response?.data?.error?.message
            || 'Could not save'}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${warn ? 'text-apple-red' : 'text-ios-dark'}`}>{value}</p>
      <p className="text-xs text-ios-muted mt-0.5">{label}</p>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ios-secondary mb-1">{label}</span>
      <input type="number" min={0} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input-apple w-full text-sm tabular-nums" />
    </label>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; calls: number; spend: number }> }) {
  return (
    <div>
      <p className="text-xs font-medium text-ios-secondary mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-ios-muted">Nothing yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-2 text-sm">
              <span className="text-ios-secondary truncate" title={r.label}>{r.label}</span>
              <span className="tabular-nums text-ios-dark shrink-0">
                {r.calls.toLocaleString('en-IN')} · {'₹' + r.spend.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
