/**
 * Credit settings — the numbers that decide what a credit is worth.
 *
 * The peg (how many credits a dollar buys) was hardcoded, which made it the one
 * pricing decision that needed a deploy. It is also the decision that decides
 * whether a credit pack and the rate card agree: a buyer paying 11x what the
 * engine spends is a peg problem, not a pack problem.
 *
 * So the panel does not just expose fields — it shows what the current values
 * imply, and recalculates as they are edited, because a peg on its own means
 * nothing to look at.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Coins, AlertTriangle, Check, Loader2, RotateCcw, Wand2 } from 'lucide-react';

export default function SuperAdminCreditSettings() {
  const qc = useQueryClient();
  const [peg, setPeg] = useState<number | null>(null);
  const [currency, setCurrency] = useState('');
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-settings'],
    queryFn: async () => (await api.get('/superadmin/credit-settings')).data?.data,
  });

  // Seed the inputs once, then leave them alone so typing is not overwritten
  // by a refetch mid-edit.
  useEffect(() => {
    if (data && peg === null) {
      setPeg(data.creditsPerUsd);
      setCurrency(data.currency.currency);
      setFxRate(data.currency.fxRate);
    }
  }, [data, peg]);

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

  if (isLoading || peg === null) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 animate-spin text-wa-green" /></div>;
  }

  const imp = data.implications;
  const pack = imp?.samplePack;
  const symbol = data.currency.symbol;
  const dirty = peg !== data.creditsPerUsd || currency !== data.currency.currency || fxRate !== data.currency.fxRate;

  // What the entered peg would do, computed here so the effect of a change is
  // visible before it is saved.
  const previewCreditWorth = (1 / (peg || 1)) * (fxRate || 1);
  const previewSell = imp ? (imp.marketingSellPerMessage / imp.creditWorth) * previewCreditWorth : 0;
  const previewCost = imp ? (imp.marketingCostPerMessage / imp.creditWorth) * previewCreditWorth : 0;
  const previewRatio = pack && previewCreditWorth > 0
    ? (pack.buyerPerMessageMinor / 100) / previewSell
    : null;

  /** The peg at which a buyer pays what the engine spends. */
  const alignedPeg = pack && imp
    ? Math.round(data.creditsPerUsd / (pack.valueRatio || 1))
    : null;

  return (
    <div className="space-y-5">
      {pack && pack.valueRatio != null && Math.abs(pack.valueRatio - 1) > 0.2 && (
        <div className="card-apple p-4 border border-apple-red/30 bg-apple-red/5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-ios-dark">
              A buyer pays {pack.valueRatio}× what a credit is worth when it is spent.
            </p>
            <p className="text-ios-secondary mt-1">
              The {pack.name} pack works out to {symbol}{(pack.buyerPerMessageMinor / 100).toFixed(2)} per message,
              but sending one draws {symbol}{imp.marketingSellPerMessage} off the balance. Either the pack price or
              the peg is wrong — they describe the same thing.
            </p>
            {alignedPeg && (
              <button
                onClick={() => setPeg(alignedPeg)}
                className="mt-2 inline-flex items-center gap-1.5 text-wa-green font-medium hover:underline"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Set the peg to {alignedPeg.toLocaleString('en-IN')} so they agree
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card-apple p-5">
        <h3 className="font-semibold text-ios-dark inline-flex items-center gap-2">
          <Coins className="w-5 h-5 text-ios-muted" /> Credit settings
        </h3>
        <p className="text-xs text-ios-muted mt-1 max-w-2xl">
          The peg fixes what a credit is worth. Every rate on the card is stored in credits, so changing
          it rescales every price and every outstanding balance at once.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <label className="block">
            <span className="block text-xs font-medium text-ios-secondary mb-1">
              Credits per USD <span className="text-ios-muted font-normal">— default {data.creditsPerUsdDefault.toLocaleString('en-IN')}</span>
            </span>
            <input
              type="number" min={1} value={peg}
              onChange={(e) => setPeg(Number(e.target.value))}
              className="input-apple w-full text-sm tabular-nums"
            />
          </label>
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
              {currency} per USD <span className="text-ios-muted font-normal">— {data.currency.fxSource}</span>
            </span>
            <input
              type="number" step="0.01" min={0} value={fxRate ?? 0}
              onChange={(e) => setFxRate(Number(e.target.value))}
              className="input-apple w-full text-sm tabular-nums"
            />
          </label>
        </div>

        {/* What these numbers mean, recalculated as they are typed. */}
        <div className="mt-5 p-4 bg-ios-gray/50 rounded-apple-lg">
          <p className="text-xs font-medium text-ios-secondary mb-3">
            {dirty ? 'With these values' : 'Right now'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="One credit is worth" value={`${symbol}${previewCreditWorth.toFixed(5)}`} />
            <Stat label="Marketing message — charged" value={`${symbol}${previewSell.toFixed(4)}`} />
            <Stat label="Marketing message — Meta cost" value={`${symbol}${previewCost.toFixed(4)}`} />
            <Stat
              label="Margin"
              value={previewCost > 0 ? `${(((previewSell - previewCost) / previewCost) * 100).toFixed(1)}%` : '—'}
              good
            />
          </div>
          {pack && previewRatio != null && (
            <div className="mt-4 pt-3 border-t border-black/10 text-sm">
              <span className="text-ios-muted">{pack.name} pack: </span>
              <span className="text-ios-dark">
                {symbol}{(pack.totalMinor / 100).toFixed(2)} → {pack.credits.toLocaleString('en-IN')} credits
                → {pack.messages} messages
              </span>
              <span className={`ml-2 font-medium ${Math.abs(previewRatio - 1) < 0.2 ? 'text-wa-green' : 'text-apple-red'}`}>
                buyer pays {previewRatio.toFixed(2)}× the spend rate
                {Math.abs(previewRatio - 1) < 0.2 ? ' — aligned' : ''}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => save.mutate({ creditsPerUsd: peg, currency, fxRateFromUsd: fxRate })}
            disabled={!dirty || save.isPending}
            className="btn-apple btn-wa-green text-sm disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
          {dirty && (
            <button
              onClick={() => { setPeg(data.creditsPerUsd); setCurrency(data.currency.currency); setFxRate(data.currency.fxRate); }}
              className="btn-apple btn-apple-outline text-sm inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Discard
            </button>
          )}
        </div>

        {result && (
          <div className="mt-3 p-3 bg-wa-green/10 border border-wa-green/20 rounded-apple-lg text-sm">
            <p className="inline-flex items-center gap-1.5 text-wa-green font-medium">
              <Check className="w-4 h-4" /> Saved — every price now uses these values.
            </p>
            {result.pegChanged && (
              <p className="text-ios-secondary mt-1">
                {result.outstandingCredits.toLocaleString('en-IN')} credits are outstanding across all tenants.
                They were worth ${result.outstandingUsdBefore.toLocaleString()} and are now worth
                ${result.outstandingUsdAfter.toLocaleString()} — the balances did not move, what they buy did.
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
