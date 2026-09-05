/**
 * Commerce configuration — what is sold, what is charged on top, and who takes
 * the payment.
 *
 * All three used to be constants in the frontend. The price of a credit pack
 * had no connection to the rate card that bills those credits, and drifted to
 * 11x it without anything surfacing the gap, so the package table leads with
 * that comparison rather than burying it.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Package, Percent, CreditCard, Plus, Trash2, Check, X, Coins,
  AlertTriangle, Loader2, Eye, EyeOff, Beaker,
} from 'lucide-react';
import { useCurrency } from '../lib/money';
import SuperAdminCreditSettings from './SuperAdminCreditSettings';
import PaymentProviderLogo from './PaymentProviderLogo';

type Tab = 'settings' | 'packages' | 'fees' | 'providers';

const BASIS_LABEL: Record<string, string> = {
  BASE: 'the package price',
  SUBTOTAL: 'price + earlier fees',
  PRECEDING_FEES: 'the earlier fees only',
};

export default function SuperAdminCommerceTab() {
  const [tab, setTab] = useState<Tab>('settings');
  const fx = useCurrency();
  const qc = useQueryClient();
  const money = (minor: number) =>
    `${fx.symbol}${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {([
          ['settings', 'Credit settings', Coins],
          ['packages', 'Credit packages', Package],
          ['fees', 'Fees', Percent],
          ['providers', 'Payment providers', CreditCard],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-apple-lg text-sm font-medium inline-flex items-center gap-2 transition ${
              tab === key ? 'bg-wa-green text-white' : 'bg-white border border-black/10 text-ios-muted hover:border-wa-green/40'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'settings' && <SuperAdminCreditSettings />}
      {tab === 'packages' && <Packages money={money} qc={qc} />}
      {tab === 'fees' && <Fees money={money} qc={qc} symbol={fx.symbol} />}
      {tab === 'providers' && <Providers qc={qc} />}
    </div>
  );
}

// ── packages ─────────────────────────────────────────────────────

function Packages({ money, qc }: { money: (m: number) => string; qc: any }) {
  const [draft, setDraft] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sa-credit-packages'],
    queryFn: async () => (await api.get('/superadmin/credit-packages')).data?.data,
  });

  const save = useMutation({
    mutationFn: async (p: any) =>
      p.id
        ? (await api.patch(`/superadmin/credit-packages/${p.id}`, p)).data
        : (await api.post('/superadmin/credit-packages', p)).data,
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ['sa-credit-packages'] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/superadmin/credit-packages/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sa-credit-packages'] }),
  });

  if (isLoading) return <Spinner />;
  const packages = data?.packages ?? [];
  const mispriced = data?.mispriced ?? [];

  return (
    <div className="space-y-4">
      {mispriced.length > 0 && (
        <div className="card-apple p-4 border border-apple-red/30 bg-apple-red/5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-ios-dark">
              {mispriced.length === packages.length ? 'Every package' : `${mispriced.length} package(s)`} charges
              a very different amount per credit than the rate card consumes them at.
            </p>
            <p className="text-ios-secondary mt-1">
              {mispriced.map((m: any) => `${m.name} ${m.valueRatio}x`).join(' · ')} — a buyer pays that multiple of
              what a credit is worth when it is spent. A ratio near 1 means the two agree.
            </p>
          </div>
        </div>
      )}

      <div className="card-apple p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-ios-dark">Credit packages</h3>
            <p className="text-xs text-ios-muted mt-0.5">
              Prices are stored before fees. The total below is what a buyer pays.
            </p>
          </div>
          <button
            onClick={() => setDraft({ name: '', credits: 1000, priceMinor: 9900, currency: 'INR', sortOrder: (packages.length || 0) + 1 })}
            className="btn-apple btn-wa-green text-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New package
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ios-muted border-b border-black/10">
              <tr>
                <th className="text-left py-2 font-medium">Name</th>
                <th className="text-right py-2 font-medium">Credits</th>
                <th className="text-right py-2 font-medium">Base</th>
                <th className="text-right py-2 font-medium">Buyer pays</th>
                <th className="text-right py-2 font-medium">Messages</th>
                <th className="text-right py-2 font-medium">Per msg</th>
                <th className="text-right py-2 font-medium">Value ratio</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {packages.map((p: any) => (
                <tr key={p.id} className={`border-b border-black/5 ${p.isActive ? '' : 'opacity-40'}`}>
                  <td className="py-2.5 text-ios-dark">
                    {p.name}
                    {p.isPopular && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-wa-green/15 text-wa-green">popular</span>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{p.credits.toLocaleString('en-IN')}</td>
                  <td className="py-2.5 text-right tabular-nums text-ios-muted">{money(p.priceMinor)}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-ios-dark">{money(p.quote.totalMinor)}</td>
                  <td className="py-2.5 text-right tabular-nums">{p.quote.messages.toLocaleString('en-IN')}</td>
                  <td className="py-2.5 text-right tabular-nums">{p.quote.perMessageMinor != null ? money(p.quote.perMessageMinor) : '—'}</td>
                  <td className={`py-2.5 text-right tabular-nums font-medium ${
                    p.quote.valueRatio > 1.5 || p.quote.valueRatio < 0.5 ? 'text-apple-red' : 'text-wa-green'
                  }`}>
                    {p.quote.valueRatio ?? '—'}x
                  </td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => setDraft(p)} className="text-xs text-wa-green hover:underline mr-3">Edit</button>
                    {p.isActive && (
                      <button onClick={() => remove.mutate(p.id)} className="text-ios-muted hover:text-apple-red">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {draft && (
        <div className="card-apple p-5 border border-wa-green/30">
          <h4 className="font-medium text-ios-dark mb-3">{draft.id ? `Edit ${draft.name}` : 'New package'}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Name">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input-apple w-full text-sm" />
            </Field>
            <Field label="Credits">
              <input type="number" value={draft.credits} onChange={(e) => setDraft({ ...draft, credits: Number(e.target.value) })} className="input-apple w-full text-sm tabular-nums" />
            </Field>
            <Field label="Base price (paise)" hint="9900 = ₹99.00, before fees">
              <input type="number" value={draft.priceMinor} onChange={(e) => setDraft({ ...draft, priceMinor: Number(e.target.value) })} className="input-apple w-full text-sm tabular-nums" />
            </Field>
            <Field label="Sort order">
              <input type="number" value={draft.sortOrder ?? 0} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} className="input-apple w-full text-sm tabular-nums" />
            </Field>
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <Toggle checked={!!draft.isPopular} onChange={(v) => setDraft({ ...draft, isPopular: v })} label="Mark popular" />
            <Toggle checked={draft.isActive !== false} onChange={(v) => setDraft({ ...draft, isActive: v })} label="Active" />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => save.mutate({
                id: draft.id, name: draft.name, credits: draft.credits, priceMinor: draft.priceMinor,
                currency: draft.currency || 'INR', isPopular: !!draft.isPopular,
                isActive: draft.isActive !== false, sortOrder: draft.sortOrder ?? 0,
              })}
              disabled={!draft.name || save.isPending}
              className="btn-apple btn-wa-green text-sm disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setDraft(null)} className="btn-apple btn-apple-outline text-sm">Cancel</button>
          </div>
          {save.isError && <p className="text-xs text-apple-red mt-2">{(save.error as any)?.response?.data?.error?.message || 'Could not save'}</p>}
        </div>
      )}
    </div>
  );
}

// ── fees ─────────────────────────────────────────────────────────

function Fees({ money, qc, symbol }: { money: (m: number) => string; qc: any; symbol: string }) {
  const [draft, setDraft] = useState<any>(null);
  const [testAmount, setTestAmount] = useState(100000);

  const { data, isLoading } = useQuery({
    queryKey: ['sa-fees'],
    queryFn: async () => (await api.get('/superadmin/fees')).data?.data,
  });

  const preview = useQuery({
    queryKey: ['sa-fee-preview', testAmount],
    queryFn: async () => (await api.post('/superadmin/fees/preview', { amountMinor: testAmount })).data?.data,
    enabled: testAmount > 0,
  });

  const save = useMutation({
    mutationFn: async (f: any) =>
      f.id ? (await api.patch(`/superadmin/fees/${f.id}`, f)).data : (await api.post('/superadmin/fees', f)).data,
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['sa-fees'] });
      qc.invalidateQueries({ queryKey: ['sa-fee-preview'] });
      qc.invalidateQueries({ queryKey: ['sa-credit-packages'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/superadmin/fees/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-fees'] });
      qc.invalidateQueries({ queryKey: ['sa-fee-preview'] });
    },
  });

  if (isLoading) return <Spinner />;
  const fees = data?.fees ?? [];

  return (
    <div className="space-y-4">
      <div className="card-apple p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-ios-dark">Fees</h3>
          <button
            onClick={() => setDraft({ name: '', code: '', type: 'PERCENT', value: 200, basis: 'BASE', appliesTo: 'CREDIT_PURCHASE', isVisible: true, isActive: true, sortOrder: fees.length + 1 })}
            className="btn-apple btn-wa-green text-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add fee
          </button>
        </div>
        <p className="text-xs text-ios-muted mb-4">
          Charged in order. A percentage says what it is a percentage <em>of</em>, so tax on a service
          charge is expressible rather than approximated.
        </p>

        <div className="space-y-2">
          {fees.map((f: any) => (
            <div key={f.id} className={`flex items-center gap-3 p-3 rounded-apple-lg border ${f.isActive ? 'border-black/10 bg-white' : 'border-black/5 bg-ios-gray/40 opacity-60'}`}>
              <span className="text-xs text-ios-muted tabular-nums w-6">{f.sortOrder}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ios-dark">{f.name}</span>
                  <code className="text-xs text-ios-muted">{f.code}</code>
                  {!f.isVisible && (
                    <span className="text-xs inline-flex items-center gap-1 text-ios-muted"><EyeOff className="w-3 h-3" /> hidden from buyer</span>
                  )}
                </div>
                <p className="text-xs text-ios-muted mt-0.5">
                  {f.type === 'PERCENT'
                    ? `${(f.value / 100).toFixed(2)}% of ${BASIS_LABEL[f.basis] ?? f.basis}`
                    : `${money(f.value)} flat`}
                  {' · '}{f.appliesTo.toLowerCase().replace('_', ' ')}
                </p>
              </div>
              <button onClick={() => setDraft(f)} className="text-xs text-wa-green hover:underline">Edit</button>
              <button onClick={() => remove.mutate(f.id)} className="text-ios-muted hover:text-apple-red">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {fees.length === 0 && <p className="text-sm text-ios-muted py-4">No fees configured — buyers pay the package price exactly.</p>}
        </div>
      </div>

      {/* Try a stack before committing to it. */}
      <div className="card-apple p-5">
        <h4 className="font-medium text-ios-dark text-sm inline-flex items-center gap-2">
          <Beaker className="w-4 h-4 text-ios-muted" /> Try it on an amount
        </h4>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm text-ios-muted">{symbol}</span>
          <input
            type="number"
            value={testAmount / 100}
            onChange={(e) => setTestAmount(Math.round(Number(e.target.value) * 100))}
            className="input-apple w-32 text-sm tabular-nums"
          />
        </div>
        {preview.data && (
          <div className="mt-3 text-sm space-y-1 max-w-md">
            <Row label="Package price" value={money(preview.data.baseMinor)} />
            {preview.data.fees.map((f: any) => (
              <Row key={f.code} label={`${f.name}${f.rate ? ` (${f.rate} of ${BASIS_LABEL[f.basis] ?? f.basis})` : ''}`} value={money(f.amountMinor)} muted />
            ))}
            <div className="border-t border-black/10 pt-1 mt-1">
              <Row label="Buyer pays" value={money(preview.data.totalMinor)} bold />
            </div>
          </div>
        )}
      </div>

      {draft && (
        <div className="card-apple p-5 border border-wa-green/30">
          <h4 className="font-medium text-ios-dark mb-3">{draft.id ? `Edit ${draft.name}` : 'New fee'}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input-apple w-full text-sm" /></Field>
            <Field label="Code" hint="lowercase, no spaces">
              <input value={draft.code} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} className="input-apple w-full text-sm disabled:opacity-60" />
            </Field>
            <Field label="Type">
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className="input-apple w-full text-sm">
                <option value="PERCENT">Percentage</option>
                <option value="FIXED">Fixed amount</option>
              </select>
            </Field>
            <Field label={draft.type === 'PERCENT' ? 'Percent (basis points)' : 'Amount (paise)'} hint={draft.type === 'PERCENT' ? '200 = 2.00%' : '500 = ₹5.00'}>
              <input type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} className="input-apple w-full text-sm tabular-nums" />
            </Field>
            {draft.type === 'PERCENT' && (
              <Field label="Percent of">
                <select value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value })} className="input-apple w-full text-sm">
                  <option value="BASE">The package price</option>
                  <option value="SUBTOTAL">Price + earlier fees</option>
                  <option value="PRECEDING_FEES">The earlier fees only</option>
                </select>
              </Field>
            )}
            <Field label="Applies to">
              <select value={draft.appliesTo} onChange={(e) => setDraft({ ...draft, appliesTo: e.target.value })} className="input-apple w-full text-sm">
                <option value="CREDIT_PURCHASE">Credit purchases</option>
                <option value="SUBSCRIPTION">Subscriptions</option>
                <option value="ALL">Both</option>
              </select>
            </Field>
            <Field label="Order"><input type="number" value={draft.sortOrder ?? 0} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} className="input-apple w-full text-sm tabular-nums" /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
            <Toggle checked={draft.isVisible !== false} onChange={(v) => setDraft({ ...draft, isVisible: v })} label="Show to buyer" />
            <Toggle checked={draft.isActive !== false} onChange={(v) => setDraft({ ...draft, isActive: v })} label="Active" />
          </div>
          <Field label="Description (optional)">
            <input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input-apple w-full text-sm mt-1" />
          </Field>
          <div className="flex gap-2 mt-4">
            <button onClick={() => save.mutate(draft)} disabled={!draft.name || !draft.code || save.isPending} className="btn-apple btn-wa-green text-sm disabled:opacity-50">
              {save.isPending ? 'Saving…' : 'Save fee'}
            </button>
            <button onClick={() => setDraft(null)} className="btn-apple btn-apple-outline text-sm">Cancel</button>
          </div>
          {save.isError && <p className="text-xs text-apple-red mt-2">{(save.error as any)?.response?.data?.error?.message || 'Could not save'}</p>}
        </div>
      )}
    </div>
  );
}

// ── payment providers ────────────────────────────────────────────

function Providers({ qc }: { qc: any }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [testResult, setTestResult] = useState<Record<string, any>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['sa-payment-providers'],
    queryFn: async () => (await api.get('/superadmin/payment-providers')).data?.data,
  });

  const save = useMutation({
    mutationFn: async ({ provider, body }: any) => (await api.put(`/superadmin/payment-providers/${provider}`, body)).data,
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ['sa-payment-providers'] }); },
  });

  const test = useMutation({
    mutationFn: async (provider: string) => ({ provider, res: (await api.post(`/superadmin/payment-providers/${provider}/test`)).data?.data }),
    onSuccess: ({ provider, res }) => setTestResult((t) => ({ ...t, [provider]: res })),
  });

  if (isLoading) return <Spinner />;
  const configured = data?.providers ?? [];
  const available = data?.available ?? [];

  return (
    <div className="card-apple p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-ios-dark">Payment providers</h3>
        <p className="text-xs text-ios-muted mt-0.5">
          Secrets are encrypted before they are stored and never sent back to this screen — only whether one is set.
        </p>
      </div>

      {available.map((a: any) => {
        const cfg = configured.find((c: any) => c.provider === a.provider);
        const open = editing === a.provider;
        const result = testResult[a.provider];
        return (
          <div key={a.provider} className={`p-4 rounded-apple-lg border ${cfg?.isActive ? 'border-wa-green/40 bg-wa-green/5' : 'border-black/10'}`}>
            <div className="flex items-center gap-3">
              <PaymentProviderLogo provider={a.provider} muted={!cfg?.isActive} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ios-dark">{a.label}</span>
                  {cfg?.isDefault && <span className="text-xs px-1.5 py-0.5 rounded-full bg-wa-green/15 text-wa-green">default</span>}
                  {cfg?.testMode && cfg?.isActive && <span className="text-xs px-1.5 py-0.5 rounded-full bg-apple-orange/15 text-apple-orange">test mode</span>}
                </div>
                <p className="text-xs text-ios-muted mt-0.5">
                  {cfg?.hasSecretKey ? 'Keys stored' : 'Not configured'} · {a.currencies.join(', ')}
                </p>
              </div>
              {cfg?.hasSecretKey && (
                <button onClick={() => test.mutate(a.provider)} disabled={test.isPending} className="text-xs text-wa-green hover:underline">
                  {test.isPending ? 'Checking…' : 'Test keys'}
                </button>
              )}
              <button
                onClick={() => { setEditing(open ? null : a.provider); setForm(cfg || {}); }}
                className="text-xs text-wa-green hover:underline"
              >
                {open ? 'Close' : cfg?.hasSecretKey ? 'Edit' : 'Configure'}
              </button>
            </div>

            {result && (
              <div className={`mt-2 text-xs flex items-start gap-1.5 ${result.ok ? 'text-wa-green' : 'text-apple-red'}`}>
                {result.ok ? <Check className="w-3.5 h-3.5 mt-px" /> : <X className="w-3.5 h-3.5 mt-px" />}
                <span>{result.ok ? result.message : result.reason}</span>
              </div>
            )}

            {open && (
              <div className="mt-4 pt-4 border-t border-black/10 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Key ID / publishable key">
                    <input value={form.publicKey || ''} onChange={(e) => setForm({ ...form, publicKey: e.target.value })} className="input-apple w-full text-sm font-mono" />
                  </Field>
                  <Field label="Secret key" hint={cfg?.hasSecretKey ? 'stored — leave blank to keep it' : undefined}>
                    <input type="password" placeholder={cfg?.hasSecretKey ? '••••••••' : ''} onChange={(e) => setForm({ ...form, secretKey: e.target.value })} className="input-apple w-full text-sm font-mono" />
                  </Field>
                  {a.fields.includes('webhookSecret') && (
                    <Field label="Webhook secret" hint={cfg?.hasWebhookSecret ? 'stored — leave blank to keep it' : undefined}>
                      <input type="password" placeholder={cfg?.hasWebhookSecret ? '••••••••' : ''} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} className="input-apple w-full text-sm font-mono" />
                    </Field>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Toggle checked={!!form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" />
                  <Toggle checked={form.testMode !== false} onChange={(v) => setForm({ ...form, testMode: v })} label="Test mode" />
                  <Toggle checked={!!form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v })} label="Use by default" />
                </div>
                <button
                  onClick={() => save.mutate({ provider: a.provider, body: { ...form, label: a.label, supportedCurrencies: a.currencies } })}
                  disabled={save.isPending}
                  className="btn-apple btn-wa-green text-sm disabled:opacity-50"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── small shared bits ────────────────────────────────────────────

function Spinner() {
  return <div className="flex items-center justify-center h-32"><Loader2 className="w-7 h-7 animate-spin text-wa-green" /></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ios-secondary mb-1">
        {label}{hint && <span className="text-ios-muted font-normal"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-ios-secondary">
      <span className={`w-9 h-5 rounded-full transition relative ${checked ? 'bg-wa-green' : 'bg-black/15'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} style={{ left: checked ? 18 : 2 }} />
      </span>
      {label}
    </button>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className={muted ? 'text-ios-muted' : 'text-ios-secondary'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-semibold text-ios-dark' : muted ? 'text-ios-muted' : 'text-ios-dark'}`}>{value}</span>
    </div>
  );
}
