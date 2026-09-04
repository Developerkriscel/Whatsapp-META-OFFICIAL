/**
 * Message rate configuration — what a tenant is charged per message, by country
 * and category.
 *
 * Everything here writes to the same table the billing path reads, so a saved
 * price applies to the next message sent. The screen this replaced showed
 * hardcoded ranges and a note claiming rates were managed per tenant; nothing on
 * it was connected to anything.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Globe, Search, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useCurrency, creditsToMoney, formatUnitMoney } from '../lib/money';

interface RateCategory {
  sell: number;
  cost: number;
  marginCredits: number;
  marginPct: number | null;
  sellUsd: number;
  costUsd: number;
}

interface RateRow {
  id: string;
  countryCode: string;
  countryName: string;
  currency: string;
  marketing: RateCategory;
  utility: RateCategory;
  authentication: RateCategory;
  service: { sell: number; sellUsd: number };
}

interface LiveRow {
  country: string;
  countryName: string;
  category: string;
  volume: number;
  totalCost: number;
  costPerMessage: number;
  currency: string;
  configuredSellCredits: number | null;
  configuredSellUsd: number | null;
}

export default function SuperAdminRatesTab() {
  const queryClient = useQueryClient();
  const fx = useCurrency();
  // Per-message rates need more than two decimals: at roughly a rupee a
  // message, two would round most countries to the same number.
  const money = (credits: number) => creditsToMoney(credits, fx, true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Record<string, Record<string, number>>>({});
  const [markup, setMarkup] = useState(1.3);
  const [showLive, setShowLive] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-credit-rates'],
    queryFn: async () => {
      const r = await api.get('/superadmin/credit-rates');
      return r.data.data as { rates: RateRow[]; summary: any; cache: any };
    },
  });

  // On demand only — this calls Meta once per connected WhatsApp account.
  const liveQuery = useQuery({
    queryKey: ['superadmin-credit-rates-live'],
    queryFn: async () => {
      const r = await api.get('/superadmin/credit-rates/live', { params: { days: 30 } });
      return r.data.data as { rows: LiveRow[]; note: string; wabasQueried: number; errors: any[] };
    },
    enabled: showLive,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, number> }) => {
      await api.patch(`/superadmin/credit-rates/${id}`, values);
    },
    onSuccess: (_d, v) => {
      setEditing((e) => {
        const next = { ...e };
        delete next[v.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['superadmin-credit-rates'] });
    },
  });

  const markupMutation = useMutation({
    mutationFn: async () => {
      const r = await api.post('/superadmin/credit-rates/apply-markup', {
        markup,
        categories: ['marketing', 'utility', 'authentication'],
      });
      return r.data.data as { message: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['superadmin-credit-rates'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
      </div>
    );
  }

  const rates = data?.rates ?? [];
  const summary = data?.summary;
  const belowCost: string[] = summary?.belowCost ?? [];
  const filtered = search
    ? rates.filter(
        (r) =>
          r.countryName.toLowerCase().includes(search.toLowerCase()) ||
          r.countryCode.toLowerCase().includes(search.toLowerCase()),
      )
    : rates;

  const field = (row: RateRow, key: string, current: number) => {
    const pending = editing[row.id]?.[key];
    const value = pending ?? current;
    const dirty = pending !== undefined && pending !== current;
    return (
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) =>
          setEditing((s) => ({ ...s, [row.id]: { ...(s[row.id] || {}), [key]: Number(e.target.value) } }))
        }
        className={`w-24 px-2 py-1 text-sm rounded border tabular-nums ${
          dirty ? 'border-wa-green bg-wa-green/5' : 'border-black/10 bg-white'
        }`}
      />
    );
  };

  return (
    <div className="space-y-5">
      <div className="card-apple p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ios-dark flex items-center gap-2">
              <Globe className="w-5 h-5 text-ios-muted" />
              Message rates
            </h2>
            <p className="text-sm text-ios-muted mt-1 max-w-2xl">
              What a tenant is charged per message. Values are credits — 10,000 credits = $1.00, shown below in {fx.currency}. A saved price applies to
              the next message sent; nothing needs redeploying.
            </p>
          </div>
          <div className="text-right text-xs text-ios-muted shrink-0">
            <p>{summary?.countries ?? 0} countries configured</p>
            {data?.cache?.loadedAt && (
              <p className="mt-0.5">Billing cache refreshed {new Date(data.cache.loadedAt).toLocaleTimeString()}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div className="p-3 bg-ios-gray/50 rounded-apple-lg">
            <p className="text-2xl font-bold text-ios-dark tabular-nums">
              {summary?.averageMarketingMarginPct ?? '—'}%
            </p>
            <p className="text-xs text-ios-muted mt-0.5">Average marketing margin</p>
          </div>
          <div className="p-3 bg-ios-gray/50 rounded-apple-lg">
            <p className={`text-2xl font-bold tabular-nums ${belowCost.length ? 'text-apple-red' : 'text-wa-green'}`}>
              {belowCost.length}
            </p>
            <p className="text-xs text-ios-muted mt-0.5">Priced below Meta&apos;s cost</p>
          </div>
          <div className="p-3 bg-ios-gray/50 rounded-apple-lg">
            <p className="text-2xl font-bold text-ios-dark tabular-nums">{data?.cache?.countries ?? 0}</p>
            <p className="text-xs text-ios-muted mt-0.5">Loaded into the billing cache</p>
          </div>
        </div>

        {belowCost.length > 0 && (
          <div className="mt-4 p-3 bg-apple-red/10 border border-apple-red/20 rounded-apple-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-apple-red shrink-0 mt-0.5" />
            <p className="text-sm text-ios-secondary">
              Losing money on every message to{' '}
              <span className="font-medium text-ios-dark">{belowCost.join(', ')}</span> — priced below what Meta charges.
            </p>
          </div>
        )}
      </div>

      <div className="card-apple p-5">
        <h3 className="font-semibold text-ios-dark text-sm">Reprice everything from Meta&apos;s cost</h3>
        <p className="text-xs text-ios-muted mt-1">
          Sets every country to a multiple of what Meta charges. Countries with no recorded cost are skipped rather than
          set to zero.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <input
            type="number"
            step={0.05}
            min={1}
            max={10}
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className="w-24 px-3 py-1.5 text-sm border border-black/10 rounded-apple-lg tabular-nums"
          />
          <span className="text-sm text-ios-muted">&times; Meta&apos;s cost</span>
          <button
            onClick={() => markupMutation.mutate()}
            disabled={markupMutation.isPending}
            className="btn-apple btn-apple-outline text-sm px-4 py-1.5"
          >
            {markupMutation.isPending ? 'Applying…' : 'Apply to all countries'}
          </button>
          {markupMutation.data && <span className="text-sm text-wa-green">{markupMutation.data.message}</span>}
        </div>
        <p className="text-xs text-ios-muted mt-2">
          1.0&times; resells at cost and earns nothing. Providers typically run 1.5&ndash;2.5&times; on marketing.
        </p>
      </div>

      <div className="card-apple p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ios-dark text-sm">What Meta actually billed</h3>
            <p className="text-xs text-ios-muted mt-1 max-w-2xl">
              Meta publishes no rate card, so this is real spend divided by real volume over the last 30 days. Only
              countries with traffic appear, and amounts are in each account&apos;s own billing currency.
            </p>
          </div>
          <button
            onClick={() => {
              setShowLive(true);
              liveQuery.refetch();
            }}
            disabled={liveQuery.isFetching}
            className="btn-apple btn-apple-outline text-sm px-4 py-1.5 flex items-center gap-2 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${liveQuery.isFetching ? 'animate-spin' : ''}`} />
            Fetch from Meta
          </button>
        </div>

        {showLive && liveQuery.data && (
          <div className="mt-4">
            {liveQuery.data.rows.length === 0 ? (
              <p className="text-sm text-ios-muted">{liveQuery.data.note}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-ios-muted border-b border-black/10">
                      <th className="py-2 pr-3">Country</th>
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3 text-right">Volume</th>
                      <th className="py-2 pr-3 text-right">Total billed</th>
                      <th className="py-2 pr-3 text-right">Cost / message</th>
                      <th className="py-2 text-right">You charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveQuery.data.rows.map((r, i) => (
                      <tr key={`${r.country}-${r.category}-${i}`} className="border-b border-black/5">
                        <td className="py-2 pr-3 text-ios-dark">{r.countryName}</td>
                        <td className="py-2 pr-3 text-ios-muted">{r.category}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.volume}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {r.totalCost} {r.currency}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums font-medium text-ios-dark">
                          {r.costPerMessage} {r.currency}
                        </td>
                        <td className="py-2 text-right tabular-nums text-ios-muted">
                          {r.configuredSellUsd != null ? formatUnitMoney(r.configuredSellUsd, fx) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-ios-muted mt-3">
                  Meta&apos;s cost is in the account&apos;s billing currency and your price is in USD credits, so these
                  are two separate facts rather than a margin — comparing them needs an exchange rate this screen
                  does not hold.
                </p>
              </div>
            )}
            {liveQuery.data.errors?.length > 0 && (
              <p className="text-xs text-apple-red mt-2">
                {liveQuery.data.errors.length} account(s) could not be read: {liveQuery.data.errors[0]?.message}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card-apple">
        <div className="p-4 border-b border-black/5 flex items-center gap-3">
          <Search className="w-4 h-4 text-ios-muted shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country…"
            className="flex-1 text-sm bg-transparent outline-none"
          />
          <span className="text-xs text-ios-muted shrink-0">{filtered.length} shown</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-xs text-ios-muted bg-ios-gray/40">
                <th className="py-2.5 px-4">Country</th>
                <th className="py-2.5 px-2">Marketing</th>
                <th className="py-2.5 px-2">Utility</th>
                <th className="py-2.5 px-2">Authentication</th>
                <th className="py-2.5 px-2 text-right">Marketing margin</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const pending = editing[r.id];
                const dirty = pending && Object.keys(pending).length > 0;
                const below = r.marketing.cost > 0 && r.marketing.marginCredits < 0;
                return (
                  <tr key={r.id} className={`border-b border-black/5 ${below ? 'bg-apple-red/5' : ''}`}>
                    <td className="py-2 px-4">
                      <p className="text-ios-dark font-medium">{r.countryName}</p>
                      <p className="text-xs text-ios-muted">{r.countryCode}</p>
                    </td>
                    <td className="py-2 px-2">
                      {field(r, 'marketingCredits', r.marketing.sell)}
                      <p className="text-xs text-ios-muted mt-0.5">
                        {money(r.marketing.sell)} · cost {money(r.marketing.cost)}
                      </p>
                    </td>
                    <td className="py-2 px-2">
                      {field(r, 'utilityCredits', r.utility.sell)}
                      <p className="text-xs text-ios-muted mt-0.5">{money(r.utility.sell)}</p>
                    </td>
                    <td className="py-2 px-2">
                      {field(r, 'authCredits', r.authentication.sell)}
                      <p className="text-xs text-ios-muted mt-0.5">{money(r.authentication.sell)}</p>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <span className={below ? 'text-apple-red font-medium' : 'text-ios-dark'}>
                        {r.marketing.marginPct != null ? `${r.marketing.marginPct}%` : '—'}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right">
                      {dirty && (
                        <button
                          onClick={() => saveMutation.mutate({ id: r.id, values: pending })}
                          disabled={saveMutation.isPending}
                          className="btn-apple btn-apple-primary text-xs px-3 py-1"
                        >
                          Save
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
