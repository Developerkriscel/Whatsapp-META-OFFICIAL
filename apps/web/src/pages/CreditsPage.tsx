/**
 * Credits — the messaging balance, in rupees.
 *
 * This page used to carry its own copy of Meta's price list in USD, its own
 * exchange rate, a currency switcher and a country picker, and it converted
 * everything through a "credit" unit whose value lived in a setting elsewhere.
 * None of that was the billing engine, so the page could and did disagree with
 * what a message actually cost.
 *
 * It now shows one number that is money, the official Meta cost with the
 * margin on top, and the bill. Everything comes from /billing/summary, which
 * reads the same rates and margin the send path charges against.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import {
  Wallet, TrendingUp, RotateCcw, Plus, Loader2, CheckCircle2, Info,
} from 'lucide-react';

interface Rate {
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  metaCost: number;
  yourPrice: number;
  margin: number;
}

interface Summary {
  country: string;
  symbol: string;
  marginPercent: number;
  balance: number;
  toppedUp: number;
  billed: number;
  billedMessages: number;
  refunded: number;
  refundedMessages: number;
  rates: Rate[];
  canSend: { marketing: number; utility: number };
}

const CATEGORY_LABEL: Record<Rate['category'], string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utility',
  AUTHENTICATION: 'Authentication',
};

const CATEGORY_NOTE: Record<Rate['category'], string> = {
  MARKETING: 'Promotions, offers, product news',
  UTILITY: 'Order updates, reminders, alerts',
  AUTHENTICATION: 'One-time passcodes',
};

function money(n: number, symbol = '₹', dp = 2) {
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function CreditsPage() {
  const qc = useQueryClient();
  const [topUp, setTopUp] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: async () => (await api.get('/billing/summary')).data?.data as Summary,
    refetchInterval: 30000,
  });

  const { data: packs } = useQuery({
    queryKey: ['credit-packages'],
    queryFn: async () => (await api.get('/credit-packages')).data?.data,
  });

  // Balance is only ever granted against a confirmed payment, so this opens a
  // checkout rather than adding anything itself. `credits` is in paise, which
  // since the unit change is exactly the rupee amount times 100 — a top-up adds
  // precisely what it costs, with no exchange in between.
  const buy = useMutation({
    mutationFn: async (arg: { packageId?: string; rupees?: number }) => {
      const res = await api.post('/credits/checkout/create-order', {
        ...(arg.packageId
          ? { packageId: arg.packageId }
          : { credits: Math.round((arg.rupees || 0) * 100) }),
      });
      return res.data?.data;
    },
    onSuccess: (order: any) => {
      qc.invalidateQueries({ queryKey: ['billing-summary'] });
      setTopUp('');
      if (order?.checkoutUrl) window.location.href = order.checkoutUrl;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
      </div>
    );
  }

  const s = data.symbol || '₹';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ios-dark">Credits</h1>
        <p className="text-ios-muted">WhatsApp messaging balance</p>
      </div>

      {/* Balance, what has been billed, what came back. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-apple p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-apple-lg bg-wa-green/15 text-wa-green flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Balance</p>
              <p className="text-2xl font-bold text-wa-green tabular-nums">{money(data.balance, s)}</p>
            </div>
          </div>
          <p className="text-xs text-ios-muted mt-3">
            Enough for {data.canSend.marketing.toLocaleString('en-IN')} marketing or{' '}
            {data.canSend.utility.toLocaleString('en-IN')} utility messages
          </p>
        </div>

        <div className="card-apple p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-apple-lg bg-ios-gray text-ios-secondary flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Total bill</p>
              <p className="text-2xl font-bold text-ios-dark tabular-nums">{money(data.billed, s)}</p>
            </div>
          </div>
          <p className="text-xs text-ios-muted mt-3">
            {data.billedMessages.toLocaleString('en-IN')} delivered message
            {data.billedMessages === 1 ? '' : 's'}
          </p>
        </div>

        <div className="card-apple p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-apple-lg bg-apple-blue/10 text-apple-blue flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Returned</p>
              <p className="text-2xl font-bold text-ios-dark tabular-nums">{money(data.refunded, s)}</p>
            </div>
          </div>
          <p className="text-xs text-ios-muted mt-3">
            {data.refundedMessages.toLocaleString('en-IN')} message
            {data.refundedMessages === 1 ? '' : 's'} that never reached anyone
          </p>
        </div>
      </div>

      {/* The one rule worth stating plainly, because it is unusual. */}
      <div className="card-apple p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-wa-green shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-ios-dark">You only pay for messages that arrive.</p>
          <p className="text-ios-secondary mt-0.5">
            The price is held when a message is sent, and returned in full if WhatsApp cannot deliver
            it. Failed sends cost nothing.
          </p>
        </div>
      </div>

      {/* Meta's official cost, and what you pay on top. */}
      <div className="card-apple p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-ios-dark">Message rates — {data.country}</h2>
          <p className="text-xs text-ios-muted">
            Meta&apos;s official price plus a {data.marginPercent}% platform fee
          </p>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ios-muted text-left border-b border-black/10">
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium text-right">Meta&apos;s price</th>
                <th className="py-2 pr-4 font-medium text-right">Platform fee</th>
                <th className="py-2 font-medium text-right">You pay</th>
              </tr>
            </thead>
            <tbody>
              {data.rates.map((r) => (
                <tr key={r.category} className="border-b border-black/5 last:border-0">
                  <td className="py-3 pr-4">
                    <p className="text-ios-dark font-medium">{CATEGORY_LABEL[r.category]}</p>
                    <p className="text-xs text-ios-muted">{CATEGORY_NOTE[r.category]}</p>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-ios-secondary">
                    {money(r.metaCost, s, 2)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-ios-secondary">
                    {money(r.margin, s, 2)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-ios-dark font-semibold">
                    {money(r.yourPrice, s, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ios-muted mt-3 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-px shrink-0" />
          Meta bills per message delivered. Replies inside an open 24-hour customer service window
          are free and are not charged here.
        </p>
      </div>

      {/* Top up. A pack adds exactly what it costs — there is no exchange. */}
      <div className="card-apple p-5">
        <h2 className="font-semibold text-ios-dark">Add balance</h2>
        <p className="text-xs text-ios-muted mt-1">
          What you pay is what lands in your balance.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {(packs || []).map((k: any) => (
            <button
              key={k.id}
              onClick={() => buy.mutate({ packageId: k.id })}
              disabled={buy.isPending}
              className="p-4 rounded-apple-lg border border-black/10 hover:border-wa-green hover:bg-wa-green/5 transition text-left disabled:opacity-50"
            >
              <p className="text-xs text-ios-muted">{k.name}</p>
              <p className="text-lg font-semibold text-ios-dark tabular-nums mt-0.5">
                {money(k.price ?? k.priceMinor / 100, s)}
              </p>
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2 mt-4 max-w-sm">
          <label className="flex-1">
            <span className="block text-xs font-medium text-ios-secondary mb-1">Or any amount</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ios-muted text-sm">{s}</span>
              <input
                type="number" min={1} step="1" value={topUp}
                onChange={(e) => setTopUp(e.target.value)}
                placeholder="500"
                className="input-apple w-full text-sm tabular-nums pl-7"
              />
            </div>
          </label>
          <button
            onClick={() => buy.mutate({ rupees: Number(topUp) })}
            disabled={!topUp || Number(topUp) <= 0 || buy.isPending}
            className="btn-apple btn-wa-green text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {buy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>

        {buy.isError && (
          <p className="text-xs text-apple-red mt-2">
            {(buy.error as any)?.response?.data?.error?.message || 'Could not add balance'}
          </p>
        )}
      </div>
    </div>
  );
}
