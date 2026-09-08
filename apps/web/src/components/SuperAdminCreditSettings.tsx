/**
 * Credit settings — what a credit is worth, in rupees.
 *
 * This panel used to be built around "credits per USD". The rate card is
 * stored in credits and the reporting currency is INR, so the dollar was never
 * anything but a waypoint: an admin pricing an Indian product had to set a
 * per-dollar peg, then multiply by an exchange rate in their head to find out
 * what a message would actually cost. Two of the three primary inputs were
 * about a currency nobody here bills in.
 *
 * So the peg is now entered as what one credit is worth in rupees, and the
 * USD conversion happens once on the server. The exchange rate still exists —
 * Meta invoices in dollars and those invoices have to be converted for
 * reporting — but it no longer decides what anything costs, and it has moved
 * out of the way accordingly.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Coins, AlertTriangle, Check, Loader2, RotateCcw, Wand2, ChevronDown, ChevronRight,
} from 'lucide-react';

/** Indian grouping, and enough decimals that a sub-paisa rate is still legible. */
function inr(n: number, dp = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function SuperAdminCreditSettings() {
  const qc = useQueryClient();
  const [worth, setWorth] = useState<string>('');
  const [currency, setCurrency] = useState('');
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-settings'],
    queryFn: async () => (await api.get('/superadmin/credit-settings')).data?.data,
  });

  // Seed once, then leave the inputs alone so a refetch cannot overwrite
  // half-typed digits.
  useEffect(() => {
    if (data && worth === '') {
      setWorth(String(data.implications?.creditWorth ?? ''));
      setCurrency(data.currency.currency);
      setFxRate(data.currency.fxRate);
    }
  }, [data, worth]);

  const save = useMutation({
    mutationFn: async (body: any) => (await api.patch('/superadmin/credit-settings', body)).data?.data,
    onSuccess: (d) => {
      setResult(d);
      qc.invalidateQueries({ queryKey: ['credit-settings'] });
      qc.invalidateQueries({ queryKey: ['sa-credit-packages'] });
      qc.invalidateQueries({ queryKey: ['superadmin-credit-rates'] });
      qc.invalidateQueries({ queryKey: ['platform-currency'] });
    },
  });

  if (isLoading || worth === '') {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-7 h-7 animate-spin text-wa-green" />
      </div>
    );
  }

  const imp = data.implications;
  const symbol = data.currency.symbol;
  const packs: any[] = data.packs || [];
  const consensus = data.consensus;

  const worthNum = Number(worth);
  const valid = Number.isFinite(worthNum) && worthNum > 0;

  const savedWorth = imp?.creditWorth ?? 0;
  const dirty =
    (valid && Math.abs(worthNum - savedWorth) > 1e-12) ||
    currency !== data.currency.currency ||
    fxRate !== data.currency.fxRate;

  // Everything below follows from one number, so it can be recomputed here as
  // it is typed rather than waiting for a save to find out.
  const rateCredits = imp && imp.creditWorth > 0 ? imp.marketingSellPerMessage / imp.creditWorth : 0;
  const costCredits = imp && imp.creditWorth > 0 ? imp.marketingCostPerMessage / imp.creditWorth : 0;
  const sell = rateCredits * worthNum;
  const cost = costCredits * worthNum;
  const margin = cost > 0 ? ((sell - cost) / cost) * 100 : null;

  /** A pack agrees if it prices credits within 2% of the value being set. */
  const agrees = (implied: number) =>
    valid && worthNum > 0 && Math.abs(implied - worthNum) / worthNum < 0.02;
  const disagreeing = packs.filter((k) => k.impliedCreditWorth > 0 && !agrees(k.impliedCreditWorth));

  return (
    <div className="space-y-5">
      {/* The packs state a credit's worth just as much as the peg does. When
          they disagree, one of them is wrong — and which one is a pricing
          decision, so name both numbers rather than picking. */}
      {consensus && !agrees(consensus.creditWorth) && (
        <div className="card-apple p-4 border border-apple-red/30 bg-apple-red/5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-ios-dark">
              Your packs sell credits at {symbol}{inr(consensus.creditWorth, 4)} each, but a credit is
              set to be worth {symbol}{inr(worthNum, 4)}.
            </p>
            <p className="text-ios-secondary mt-1">
              {consensus.packs.length === 1
                ? `The ${consensus.packs[0]} pack prices`
                : `${consensus.packs.join(', ')} all price`}{' '}
              credits at {symbol}{inr(consensus.creditWorth, 4)}. A buyer pays that; the engine spends
              them at {symbol}{inr(worthNum, 4)}. Both describe the same credit, so one of the two is
              wrong — either the packs are mispriced or this value is.
            </p>
            <button
              onClick={() => setWorth(String(consensus.creditWorth))}
              className="mt-2 inline-flex items-center gap-1.5 text-wa-green font-medium hover:underline"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Match the packs — {symbol}{inr(consensus.creditWorth, 4)} per credit
            </button>
          </div>
        </div>
      )}

      <div className="card-apple p-5">
        <h3 className="font-semibold text-ios-dark inline-flex items-center gap-2">
          <Coins className="w-5 h-5 text-ios-muted" /> What a credit is worth
        </h3>
        <p className="text-xs text-ios-muted mt-1 max-w-2xl">
          Every rate on the card is stored in credits. This is the one number that turns them into
          rupees, so changing it rescales every price and every outstanding balance at once.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-w-xl">
          <label className="block">
            <span className="block text-xs font-medium text-ios-secondary mb-1">One credit is worth</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ios-muted text-sm">
                {symbol}
              </span>
              <input
                type="number" step="0.0001" min={0} value={worth}
                onChange={(e) => setWorth(e.target.value)}
                className="input-apple w-full text-sm tabular-nums pl-7"
              />
            </div>
          </label>
          <div className="flex flex-col justify-end pb-2">
            <p className="text-xs text-ios-muted">
              {valid && worthNum > 0 ? (
                <>
                  {symbol}1 buys{' '}
                  <span className="text-ios-dark font-medium tabular-nums">
                    {inr(1 / worthNum, 2)}
                  </span>{' '}
                  credits
                </>
              ) : (
                'Enter an amount greater than zero'
              )}
            </p>
          </div>
        </div>

        {/* What the entered value means, recalculated as it is typed. */}
        <div className="mt-5 p-4 bg-ios-gray/50 rounded-apple-lg">
          <p className="text-xs font-medium text-ios-secondary mb-3">
            {dirty ? 'With this value' : 'Right now'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="Marketing message — you charge" value={`${symbol}${inr(sell, 4)}`} />
            <Stat label="Marketing message — Meta costs you" value={`${symbol}${inr(cost, 4)}`} />
            <Stat label="You keep" value={`${symbol}${inr(sell - cost, 4)}`} />
            <Stat label="Margin" value={margin != null ? `${margin.toFixed(1)}%` : '—'} good />
          </div>
        </div>

        {/* Each pack states a credit's worth on its own. Showing all of them
            makes a mispriced pack visible instead of averaging it away. */}
        {packs.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-ios-secondary mb-2">
              What each pack implies a credit is worth
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ios-muted text-left border-b border-black/10">
                    <th className="py-2 pr-4 font-medium">Pack</th>
                    <th className="py-2 pr-4 font-medium text-right">Price</th>
                    <th className="py-2 pr-4 font-medium text-right">Credits</th>
                    <th className="py-2 pr-4 font-medium text-right">Per credit</th>
                    <th className="py-2 pr-4 font-medium text-right">Messages</th>
                    <th className="py-2 pr-4 font-medium text-right">Per message</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {packs.map((k) => {
                    const ok = agrees(k.impliedCreditWorth);
                    return (
                      <tr key={k.id} className="border-b border-black/5 last:border-0">
                        <td className="py-2 pr-4 text-ios-dark">{k.name}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-ios-dark">
                          {symbol}{inr(k.price)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-ios-secondary">
                          {k.credits.toLocaleString('en-IN')}
                        </td>
                        <td className={`py-2 pr-4 text-right tabular-nums ${ok ? 'text-ios-dark' : 'text-apple-red font-medium'}`}>
                          {symbol}{inr(k.impliedCreditWorth, 4)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-ios-secondary">
                          {k.messages.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-ios-secondary">
                          {symbol}{inr(k.perMessage)}
                        </td>
                        <td className="py-2 text-right">
                          {ok ? (
                            <span className="text-xs text-wa-green inline-flex items-center gap-1">
                              <Check className="w-3 h-3" /> agrees
                            </span>
                          ) : (
                            <span className="text-xs text-apple-red">off by {
                              worthNum > 0
                                ? `${(k.impliedCreditWorth / worthNum).toFixed(2)}×`
                                : '—'
                            }</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {disagreeing.length > 0 && (
              <p className="text-xs text-ios-muted mt-2">
                A pack that disagrees is sold at a different price than it is spent at. Fix it on the
                Credit packages tab, or set the value above to match.
              </p>
            )}
          </div>
        )}

        {/* Meta invoices in dollars, so a rate is still needed to read those
            invoices — but it does not price anything here, and it belongs out
            of the way of the decision this page is for. */}
        <div className="mt-5 border-t border-black/10 pt-4">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-ios-secondary hover:text-ios-dark"
          >
            {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Reporting currency and exchange rate
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 max-w-xl">
              <label className="block">
                <span className="block text-xs font-medium text-ios-secondary mb-1">Reporting currency</span>
                <input
                  value={currency} maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="input-apple w-full text-sm uppercase"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-ios-secondary mb-1">
                  {currency} per US$1{' '}
                  <span className="text-ios-muted font-normal">— {data.currency.fxSource}</span>
                </span>
                <input
                  type="number" step="0.01" min={0} value={fxRate ?? 0}
                  onChange={(e) => setFxRate(Number(e.target.value))}
                  className="input-apple w-full text-sm tabular-nums"
                />
              </label>
              <p className="text-xs text-ios-muted md:col-span-2">
                Meta invoices in US dollars. This rate converts their invoices for reporting only — it
                does not affect what a credit is worth or what a message costs, both of which you set
                in {currency} above.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => save.mutate({ creditWorth: worthNum, currency, fxRateFromUsd: fxRate })}
            disabled={!dirty || !valid || save.isPending}
            className="btn-apple btn-wa-green text-sm disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
          {dirty && (
            <button
              onClick={() => {
                setWorth(String(imp?.creditWorth ?? ''));
                setCurrency(data.currency.currency);
                setFxRate(data.currency.fxRate);
              }}
              className="btn-apple btn-apple-outline text-sm inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Discard
            </button>
          )}
        </div>

        {result && (
          <div className="mt-3 p-3 bg-wa-green/10 border border-wa-green/20 rounded-apple-lg text-sm">
            <p className="inline-flex items-center gap-1.5 text-wa-green font-medium">
              <Check className="w-4 h-4" /> Saved — every price now uses this value.
            </p>
            {result.pegChanged && (
              <p className="text-ios-secondary mt-1">
                {result.outstandingCredits.toLocaleString('en-IN')} credits are outstanding across all
                tenants. They were worth {result.symbol}{inr(result.outstandingBefore)} and are now
                worth {result.symbol}{inr(result.outstandingAfter)} — the balances did not move, what
                they buy did.
              </p>
            )}
          </div>
        )}
        {save.isError && (
          <p className="text-xs text-apple-red mt-2">
            {(save.error as any)?.response?.data?.error?.message || 'Could not save'}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${good ? 'text-wa-green' : 'text-ios-dark'}`}>{value}</p>
      <p className="text-xs text-ios-muted mt-0.5">{label}</p>
    </div>
  );
}
