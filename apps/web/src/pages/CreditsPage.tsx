/**
 * Credits Page — Tenant credit balance, purchase, and usage with WhatsApp pricing
 * Default: India (IN) with INR currency
 *
 * Meta WhatsApp API Rates (per message in USD, effective July 2026):
 * https://developers.facebook.com/docs/whatsapp/pricing
 *
 * Payment Gateway Fees (Razorpay India):
 * - Transaction Fee: 2% + 18% GST on fee = 2.36%
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useCurrency, creditsToMoney, formatCredits } from '../lib/money';
import {
  Coins, ArrowDown, ArrowUp, CreditCard, TrendingDown, Zap,
  Info, Globe, ChevronDown, Search, X, Check, AlertTriangle, Minus, RefreshCw
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'PURCHASE' | 'USAGE' | 'REFUND' | 'BONUS' | 'ADJUSTMENT';
  amount: number;
  description: string | null;
  balanceAfter: number;
  createdAt: string;
}

interface CategoryData {
  credits?: number;
  usd?: number;
  localCurrency?: string;
  localFormatted: string;
  displayCurrency?: string;
  displayFormatted: string;
  note?: string;
}

interface RateInfo {
  countryCode: string;
  countryName: string;
  billingCurrency: string;
  localCurrency: string;
  categories: {
    marketing: CategoryData;
    utility: CategoryData;
    authentication: CategoryData;
    session: CategoryData;
  };
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

// ============================================
// META OFFICIAL RATES (Credits per message)
// Source: Meta WhatsApp Business Platform Rate Card - July 2026
// ============================================
// Credits formula: 1 credit = $0.0001 USD
// e.g., $0.0618 → 618 credits, $0.0014 → 14 credits

const META_RATES_USD: Record<string, { marketing: number; utility: number; auth: number }> = {
  IN: { marketing: 118, utility: 14, auth: 14 },   // India - ₹0.0014/msg (utility)
  US: { marketing: 175, utility: 50, auth: 50 },    // USA
  GB: { marketing: 635, utility: 220, auth: 220 },  // UK
  AE: { marketing: 499, utility: 157, auth: 157 },  // UAE
  SG: { marketing: 732, utility: 160, auth: 160 },  // Singapore
  MY: { marketing: 860, utility: 140, auth: 140 },  // Malaysia
  ID: { marketing: 411, utility: 250, auth: 250 },  // Indonesia
  BR: { marketing: 625, utility: 68, auth: 68 },    // Brazil
  AU: { marketing: 250, utility: 50, auth: 50 },   // Australia
  DE: { marketing: 1365, utility: 550, auth: 550 }, // Germany
  FR: { marketing: 859, utility: 300, auth: 300 },   // France
  MX: { marketing: 305, utility: 85, auth: 85 },     // Mexico
  NG: { marketing: 516, utility: 67, auth: 67 },     // Nigeria
  ZA: { marketing: 516, utility: 67, auth: 67 },    // South Africa
  SA: { marketing: 501, utility: 107, auth: 107 }, // Saudi Arabia
  PK: { marketing: 473, utility: 100, auth: 100 },  // Pakistan
  PH: { marketing: 860, utility: 140, auth: 140 }, // Philippines
  TH: { marketing: 860, utility: 140, auth: 140 },  // Thailand
  VN: { marketing: 411, utility: 250, auth: 250 },  // Vietnam
};

// Rates used to live here as a second, private copy of the FX table — it drifted
// to 83.85 while the rate card ran on 88.5, so the same spend read differently
// depending on which page you opened. There is now one rate, from the platform
// setting, and this file reads it like everything else.

// Payment Gateway Fees (Razorpay India)
const PLATFORM_FEE_RATE = 0.02; // 2% transaction fee
const GST_RATE = 0.18; // 18% GST on platform fee

// Helper to calculate price from credits
// Base price: 1000 credits = ₹99 for India (ALL-INCLUSIVE price)
// Platform fee and GST are calculated on top
const calculatePrice = (credits: number, countryCode: string, usdRate = 88.5): { baseLocal: number; platformFee: number; gst: number; total: number; currency: string } => {
  // Credit packs are priced in INR and every other currency is derived from it,
  // so INR — not USD — is the default for anything unmapped.
  const currency = countryCode === 'US' ? 'USD' :
                   countryCode === 'GB' ? 'GBP' : countryCode === 'EU' ? 'EUR' : 'INR';

  // Base price calculation (INCLUSIVE of fees)
  // 1000 credits = ₹99 inclusive
  // To get base + 2% fee + 18% GST on fee:
  // total = base + (base * 0.02) + (base * 0.02 * 0.18) = base * 1.0236
  // base = total / 1.0236
  const inrRate = 99 / 1000; // ₹0.099 per credit in India
  let totalLocal: number;

  const inr = credits * inrRate;
  totalLocal =
    currency === 'USD' ? inr / usdRate
    : currency === 'GBP' ? (inr / usdRate) * 0.79
    : currency === 'EUR' ? (inr / usdRate) * 0.92
    : inr;

  // Calculate base amount and fees from total
  // total = base * 1.0236 => base = total / 1.0236
  const baseLocal = totalLocal / 1.0236;
  const platformFee = baseLocal * PLATFORM_FEE_RATE;
  const gst = platformFee * GST_RATE;

  return {
    baseLocal: Math.round(baseLocal * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    total: Math.round((baseLocal + platformFee + gst) * 100) / 100,
    currency
  };
};

// Credit packs with real Meta-based pricing - Minimum 500 credits
const generatePacks = (countryCode: string, usdRate = 88.5) => {
  const packs = [
    { name: 'Starter', credits: 1000 },
    { name: 'Growth', credits: 5000 },
    { name: 'Business', credits: 15000 },
    { name: 'Enterprise', credits: 50000 },
  ];

  return packs.map((pack, index) => {
    const pricing = calculatePrice(pack.credits, countryCode, usdRate);
    const currencySymbol = pricing.currency === 'USD' ? '$' :
                           pricing.currency === 'GBP' ? '£' : pricing.currency === 'EUR' ? '€' : '₹';

    return {
      ...pack,
      price: `${currencySymbol}${Math.round(pricing.total)}`,
      basePrice: `${currencySymbol}${Math.round(pricing.baseLocal)}`,
      perMsg: `~${Math.round(pack.credits / 200)} messages`,
      popular: index === 1, // Growth is popular
    };
  });
};

// Default packs for India
const DEFAULT_PACKS = generatePacks('IN');

const CATEGORY_COLORS = {
  marketing: { bg: 'bg-wa-green/10', border: 'border-wa-green/20', text: 'text-wa-green', label: 'Marketing' },
  utility: { bg: 'bg-wa-teal/10', border: 'border-wa-teal/20', text: 'text-wa-teal', label: 'Utility' },
  authentication: { bg: 'bg-wa-green/10', border: 'border-wa-green/20', text: 'text-wa-green', label: 'Authentication' },
  session: { bg: 'bg-wa-green/5', border: 'border-wa-green/10', text: 'text-wa-teal', label: 'Session Reply' },
};

// Popular countries for quick access
const POPULAR_COUNTRIES = [
  { code: 'IN', name: 'India', flag: '🇮🇳', currency: 'INR' },
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', currency: 'AED' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', currency: 'SGD' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', currency: 'MYR' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', currency: 'IDR' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', currency: 'BRL' },
];

// Helper to get currency for country
const getCurrencyForCountry = (code: string): string => {
  const country = POPULAR_COUNTRIES.find(c => c.code === code);
  return country?.currency || 'USD';
};

// Helper to get currency symbol
const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = {
    INR: '₹', USD: '$', GBP: '£', EUR: '€', AED: 'د.إ', SGD: 'S$',
    MYR: 'RM', IDR: 'Rp', BRL: 'R$', AUD: 'A$', PHP: '₱', THB: '฿',
    VND: '₫', PKR: '₨', SAR: '﷼', NGN: '₦', ZAR: 'R', MXN: 'MX$',
  };
  return symbols[currency] || '$';
};

export default function CreditsPage() {
  // One rate for the whole app, so pack pricing and spend reporting agree.
  const fx = useCurrency();
  const [selectedCountry, setSelectedCountry] = useState('IN');
  const [displayCurrency, setDisplayCurrency] = useState('INR');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [showPurchase, setShowPurchase] = useState(false);
  const [customCredits, setCustomCredits] = useState('');

  // Generate packs based on selected country
  // Packs, their prices and their fee breakdown come from the server, which
  // reads the same tables that bill the credits. The generated list is only a
  // placeholder while that request is in flight.
  const { data: packagesData } = useQuery({
    queryKey: ['credit-packages'],
    queryFn: async () => (await api.get('/credit-packages')).data?.data,
    staleTime: 5 * 60 * 1000,
  });

  const PACKS = (packagesData?.packages?.length
    ? packagesData.packages.map((p: any) => ({
        name: p.name,
        credits: p.credits,
        price: `${fx.symbol}${(p.totalMinor / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        basePrice: `${fx.symbol}${(p.baseMinor / 100).toFixed(0)}`,
        // The real figure from the rate card, not credits over a constant.
        perMsg: `~${p.messages.toLocaleString('en-IN')} messages`,
        fees: p.fees,
        popular: p.isPopular,
        id: p.id,
      }))
    : generatePacks(selectedCountry, fx.fxRate)) as any[];

  const { data: creditsData, isLoading: creditsLoading } = useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const response = await api.get('/credits');
      return response.data;
    },
    refetchInterval: 30000,
  });

  const { data: currenciesData } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const response = await api.get('/credits/currencies');
      return response.data;
    },
  });

  const { data: ratesData } = useQuery({
    queryKey: ['rates', displayCurrency],
    queryFn: async () => {
      const response = await api.get(`/credits/rates?currency=${displayCurrency}`);
      return response.data;
    },
  });

  // Buying now goes through the gateway. The endpoint this used to call granted
  // the credits with no payment at all, and has been closed.
  const [checkoutMessage, setCheckoutMessage] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const purchaseMutation = useMutation({
    mutationFn: async (data: { packageId?: string; credits?: number }) => {
      const { buyCredits } = await import('../lib/checkout');
      return buyCredits({
        packageId: data.packageId,
        credits: data.credits,
        prefill: (() => {
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            return { name: u?.name, email: u?.email };
          } catch { return {}; }
        })(),
      });
    },
    onSuccess: (result: any) => {
      if (result.status === 'credited') {
        setCheckoutMessage({ tone: 'ok', text: `${result.credits.toLocaleString('en-IN')} credits added.` });
        setShowPurchase(false);
        setSelectedPack(null);
        setCustomCredits('');
      } else if (result.status === 'pending') {
        // The webhook is the authority; the balance catches up on its own.
        setCheckoutMessage({ tone: 'warn', text: result.message || 'Payment taken — your balance will update shortly.' });
      } else if (result.status === 'dismissed') {
        setCheckoutMessage(null);
      } else {
        setCheckoutMessage({ tone: 'err', text: result.message || 'The payment did not go through.' });
      }
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['billing-credits'] });
    },
    onError: (err: any) => {
      setCheckoutMessage({
        tone: 'err',
        text: err?.response?.data?.error?.message || err?.message || 'Could not start the payment.',
      });
    },
  });

  const queryClient = useQueryClient();

  const { data: billingCreditsData } = useQuery({
    queryKey: ['billing-credits'],
    queryFn: async () => {
      const response = await api.get('/billing/credits');
      return response.data;
    },
  });

  const autoRecharge = billingCreditsData?.data?.autoRecharge;
  const [rechargeEnabled, setRechargeEnabled] = useState(false);
  const [rechargeThreshold, setRechargeThreshold] = useState('1000');
  const [rechargeAmount, setRechargeAmount] = useState('5000');
  const [autoRechargeError, setAutoRechargeError] = useState<string | null>(null);

  useEffect(() => {
    if (autoRecharge) {
      setRechargeEnabled(autoRecharge.enabled);
      setRechargeThreshold(String(autoRecharge.threshold));
      setRechargeAmount(String(autoRecharge.amount));
    }
  }, [autoRecharge]);

  const autoRechargeMutation = useMutation({
    mutationFn: async (data: { enabled: boolean; threshold: number; amount: number }) => {
      const response = await api.patch('/billing/auto-recharge', data);
      return response.data;
    },
    onSuccess: () => {
      setAutoRechargeError(null);
      queryClient.invalidateQueries({ queryKey: ['billing-credits'] });
    },
    onError: (err: any) => {
      setAutoRechargeError(err?.response?.data?.error?.message || 'Failed to save auto-recharge settings');
    },
  });

  const balance = creditsData?.data?.balance || 0;
  const totalPurchased = creditsData?.data?.totalPurchased || 0;
  const totalUsed = creditsData?.data?.totalUsed || 0;
  const transactions: Transaction[] = creditsData?.data?.transactions || [];
  const currencies: Currency[] = currenciesData?.data || [];
  const rates: RateInfo[] = ratesData?.data || [];

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'PURCHASE': return { label: 'Purchase', color: 'text-wa-green', bg: 'bg-wa-green/20', icon: ArrowUp };
      case 'USAGE': return { label: 'Used', color: 'text-red-500', bg: 'bg-red-500/20', icon: ArrowDown };
      case 'REFUND': return { label: 'Refund', color: 'text-wa-green', bg: 'bg-wa-green/20', icon: ArrowUp };
      case 'BONUS': return { label: 'Bonus', color: 'text-wa-teal', bg: 'bg-wa-teal/20', icon: Zap };
      case 'ADJUSTMENT': return { label: 'Adjustment', color: 'text-wa-green', bg: 'bg-wa-green/20', icon: TrendingDown };
      default: return { label: type, color: 'text-ios-secondary', bg: 'bg-ios-gray', icon: Coins };
    }
  };

  const isLowBalance = balance > 0 && balance < 1000;
  const messagesRemaining = balance > 0 ? Math.round(balance / 200) : 0;

  // Calculate pricing for custom amount
  const customPricing = customCredits ? calculatePrice(parseInt(customCredits), selectedCountry, fx.fxRate) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-wa">Credits</h1>
          <p className="text-ios-secondary mt-1">WhatsApp messaging balance</p>
        </div>
        <button
          onClick={() => setShowPurchase(true)}
          className="btn-apple-blue flex items-center gap-2"
        >
          <CreditCard className="w-4 h-4" />
          Buy Credits
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Balance */}
        <div className="card-apple p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-wa-gradient/10 flex items-center justify-center">
              <Coins className="w-5 h-5 text-wa-green" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Current Balance</p>
              <p className="text-2xl font-bold text-wa-green">{formatCredits(balance)}</p>
              <p className="text-xs text-ios-muted">{creditsToMoney(balance, fx)} of messaging</p>
            </div>
          </div>
          {isLowBalance && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
              Low balance! Purchase credits soon.
            </div>
          )}
        </div>

        {/* Total Purchased */}
        <div className="card-apple p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-wa-teal/10 flex items-center justify-center">
              <ArrowUp className="w-5 h-5 text-wa-teal" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Total Purchased</p>
              <p className="text-2xl font-bold text-ios-dark">{totalPurchased.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Total Used */}
        <div className="card-apple p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <ArrowDown className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-ios-muted">Total Used</p>
              <p className="text-2xl font-bold text-ios-dark">{totalUsed.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Info */}
      <div className="card-apple p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-wa-green mt-0.5" />
          <div className="text-sm text-ios-secondary">
            <p className="font-medium text-ios-dark mb-2">How credits work</p>
            <p>Credits are charged by message category and recipient country. One credit is worth {creditsToMoney(1, fx, true)}, so a message costs roughly {creditsToMoney(14, fx, true)} to {creditsToMoney(1365, fx, true)} depending on where it goes and what kind it is.</p>
            <p className="mt-2 text-xs">Messages remaining estimate: ~{messagesRemaining.toLocaleString()} messages (based on average usage)</p>
          </div>
        </div>
      </div>

      {/* Message Rates by Category */}
      {rates.length > 0 && (
        <div className="card-apple p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ios-dark">Message Rates for {POPULAR_COUNTRIES.find(c => c.code === selectedCountry)?.name || 'India'}</h2>
            <div className="relative">
              <button
                onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-ios-gray/50 hover:bg-ios-gray rounded-lg transition"
              >
                <span>{POPULAR_COUNTRIES.find(c => c.code === selectedCountry)?.flag}</span>
                <span className="text-sm font-medium">{displayCurrency}</span>
                <ChevronDown className="w-4 h-4 text-ios-muted" />
              </button>
              {countryDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCountryDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-apple-lg border border-black/10 shadow-apple-lg z-20 max-h-80 overflow-y-auto">
                    {/* Popular Countries */}
                    <div className="px-3 py-2 text-xs text-ios-muted border-b">Popular</div>
                    {POPULAR_COUNTRIES.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => {
                          setSelectedCountry(c.code);
                          setDisplayCurrency(c.currency);
                          setCountryDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-ios-gray transition ${
                          selectedCountry === c.code ? 'bg-wa-green/10 text-wa-green' : 'text-ios-secondary'
                        }`}
                      >
                        <span className="text-lg">{c.flag}</span>
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-ios-muted ml-auto">{c.currency}</span>
                        {selectedCountry === c.code && <Check className="w-4 h-4 text-wa-green ml-auto" />}
                      </button>
                    ))}
                    <div className="px-3 py-2 text-xs text-ios-muted border-t">All Countries</div>
                    {rates.filter(r => !POPULAR_COUNTRIES.find(p => p.code === r.countryCode)).map((r) => (
                      <button
                        key={r.countryCode}
                        onClick={() => {
                          setSelectedCountry(r.countryCode);
                          setCountryDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2 hover:bg-ios-gray transition ${
                          selectedCountry === r.countryCode ? 'bg-wa-green/10 text-wa-green' : 'text-ios-secondary'
                        }`}
                      >
                        <span className="text-sm">{r.countryName}</span>
                        <span className="text-xs text-ios-muted">{r.billingCurrency}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {rates.find(r => r.countryCode === selectedCountry) && (
              <>
                {Object.entries(CATEGORY_COLORS).map(([key, value]) => {
                  const rateData = rates.find(r => r.countryCode === selectedCountry)?.categories[key as keyof typeof CATEGORY_COLORS];
                  return (
                    <div key={key} className={`p-4 rounded-xl ${value.bg} border ${value.border}`}>
                      <p className={`font-medium ${value.text}`}>{value.label}</p>
                      <p className="text-2xl font-bold text-ios-dark mt-2">
                        {rateData?.credits || '0'}
                      </p>
                      <p className="text-xs text-ios-muted mt-1">credits/message</p>
                      <p className="text-xs text-ios-muted mt-1">{rateData?.displayFormatted || '—'}</p>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Credit Packages */}
      <div className="card-apple p-6">
        <h2 className="text-lg font-semibold text-ios-dark mb-4">Credit Packages</h2>
        <p className="text-sm text-ios-muted mb-6">Choose a package based on your messaging needs. All prices include platform fees.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {checkoutMessage && (
            <div className={`col-span-full mb-2 p-3 rounded-apple-lg border text-sm ${
              checkoutMessage.tone === 'ok' ? 'bg-wa-green/10 border-wa-green/20 text-wa-green'
              : checkoutMessage.tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              {checkoutMessage.text}
            </div>
          )}
          {PACKS.map((pack, index) => (
            <div
              key={pack.name}
              onClick={() => setSelectedPack(index)}
              className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all ${
                selectedPack === index
                  ? 'border-wa-green bg-wa-green/5 shadow-wa-green'
                  : 'border-ios-border bg-white hover:border-wa-green/50'
              }`}
            >
              {pack.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-wa-gradient text-white text-xs px-3 py-1 rounded-apple-full shadow-wa">
                  Popular
                </span>
              )}
              <p className="font-bold text-ios-dark">{pack.name}</p>
              <p className="text-3xl font-bold text-wa-green mt-2">{pack.price}</p>
              <p className="text-sm text-ios-muted mt-1">{pack.credits.toLocaleString()} credits</p>
              <p className="text-xs text-ios-muted mt-2">{pack.perMsg}</p>

              {/* Show fee breakdown on hover or selection */}
              {selectedPack === index && (
                <div className="mt-3 pt-3 border-t border-wa-green/20 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ios-muted">Base (Meta API)</span>
                    <span>{pack.basePrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ios-muted">Platform Fee (2%)</span>
                    <span>{pack.fees ? pack.fees.map((f: any) => `${f.name} ${fx.symbol}${(f.amountMinor / 100).toFixed(2)}`).join(' · ') : ''}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Custom Amount */}
        <div className="card-apple p-6 mt-6">
          <h3 className="font-semibold text-ios-dark mb-4">Or Enter Custom Amount</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm text-ios-muted">Credits (min 500)</label>
              <input
                type="number"
                value={customCredits}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  if (value >= 500) {
                    setCustomCredits(value.toString());
                    setSelectedPack(null);
                  } else if (value === 0) {
                    setCustomCredits('');
                  }
                }}
                placeholder="Enter credits (min 500)..."
                className="input-apple w-full mt-1 text-lg py-3"
              />
            </div>
            {customPricing && (
              <div className="text-right min-w-[200px]">
                <p className="text-sm text-ios-muted">Total Amount</p>
                <p className="text-2xl font-bold text-wa-green">
                  {getCurrencySymbol(customPricing.currency)}{customPricing.total.toFixed(2)}
                </p>
                <p className="text-xs text-ios-muted">~{Math.round(parseInt(customCredits) / 200)} messages</p>
              </div>
            )}
          </div>
        </div>

        {/* Purchase Button */}
        <button
          onClick={() => {
            setCheckoutMessage(null);
            if (selectedPack !== null) {
              const pk = PACKS[selectedPack];
              // Prefer the package id so the server prices it from its own row
              // rather than re-deriving from a credit count.
              purchaseMutation.mutate(pk.id ? { packageId: pk.id } : { credits: pk.credits });
            } else if (customCredits && parseInt(customCredits) >= 500) {
              purchaseMutation.mutate({ credits: parseInt(customCredits) });
            }
          }}
          disabled={purchaseMutation.isPending || (selectedPack === null && (!customCredits || parseInt(customCredits) < 500))}
          className="w-full mt-6 py-4 bg-wa-gradient text-white rounded-apple-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2 shadow-wa hover:shadow-wa-hover transition"
        >
          <CreditCard className="w-5 h-5" />
          {purchaseMutation.isPending ? 'Processing...' : 'Purchase Credits'}
        </button>

        <p className="text-center text-sm text-ios-muted mt-3">
          Demo mode: Credits are added instantly without payment
        </p>
      </div>

      {/* Purchase Modal with Fee Breakdown */}
      {showPurchase && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">Purchase Credits</h3>
              <button onClick={() => setShowPurchase(false)} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            <div className="space-y-4">
              {PACKS.map((pack, i) => (
                <div
                  key={pack.name}
                  onClick={() => setSelectedPack(i)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedPack === i
                      ? 'border-wa-green bg-wa-green/5'
                      : 'border-ios-border bg-white hover:border-wa-green/50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-ios-dark">{pack.name}</p>
                      <p className="text-sm text-ios-muted">{pack.credits.toLocaleString()} credits</p>
                    </div>
                    <p className="text-xl font-bold text-wa-green">{pack.price}</p>
                  </div>

                  {/* Fee Breakdown */}
                  {selectedPack === i && (
                    <div className="mt-3 pt-3 border-t border-black/5 text-sm space-y-1.5">
                      <p className="text-xs text-ios-muted mb-2">Price Breakdown:</p>
                      <div className="flex justify-between">
                        <span className="text-ios-secondary">Base Amount (WhatsApp API)</span>
                        <span>{pack.basePrice}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ios-secondary">Platform Fee (Payment Gateway)</span>
                        <span>{pack.fees ? pack.fees.map((f: any) => `${f.name} ${fx.symbol}${(f.amountMinor / 100).toFixed(2)}`).join(' · ') : ''}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ios-secondary">GST (18% on Platform Fee)</span>
                        <span>+ {getCurrencySymbol(pack.price.replace(/[^A-Z]/g, ''))}{Math.round(parseInt(pack.price.replace(/[^0-9]/g, '')) * 0.02 / 1.02 * 0.18)}</span>
                      </div>
                      <div className="flex justify-between font-semibold pt-1 border-t border-black/5">
                        <span className="text-ios-dark">Total</span>
                        <span className="text-wa-green">{pack.price}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Confirm Button */}
            <button
              onClick={() => {
                if (selectedPack !== null) {
                  const pk = PACKS[selectedPack];
                  setCheckoutMessage(null);
                  // The modal stays open until the gateway resolves, so a
                  // dismissed payment does not look like a completed one.
                  purchaseMutation.mutate(pk.id ? { packageId: pk.id } : { credits: pk.credits });
                }
              }}
              disabled={selectedPack === null || purchaseMutation.isPending}
              className="w-full mt-6 py-3 bg-wa-gradient text-white rounded-apple-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              {purchaseMutation.isPending ? 'Processing...' : 'Confirm Purchase'}
            </button>
          </div>
        </div>
      )}

      {/* Auto Recharge */}
      <div className="card-apple p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-wa-green" />
            <h2 className="text-lg font-semibold text-ios-dark">Auto Recharge</h2>
          </div>
          <button
            onClick={() => setRechargeEnabled(!rechargeEnabled)}
            className={`relative w-12 h-7 rounded-full transition-colors ${rechargeEnabled ? 'bg-wa-green' : 'bg-ios-gray'}`}
            role="switch"
            aria-checked={rechargeEnabled}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${rechargeEnabled ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>

        <p className="text-sm text-ios-muted mb-4">
          Automatically top up your credit balance using your saved payment method whenever it drops below a threshold you set.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-ios-secondary mb-1 block">Recharge when below</label>
            <input
              type="number"
              min={100}
              value={rechargeThreshold}
              onChange={(e) => setRechargeThreshold(e.target.value)}
              disabled={!rechargeEnabled}
              className="w-full px-3 py-2 bg-ios-gray rounded-apple-lg text-ios-dark disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-secondary mb-1 block">Recharge amount</label>
            <input
              type="number"
              min={500}
              value={rechargeAmount}
              onChange={(e) => setRechargeAmount(e.target.value)}
              disabled={!rechargeEnabled}
              className="w-full px-3 py-2 bg-ios-gray rounded-apple-lg text-ios-dark disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-ios-gray rounded-apple-lg mb-4">
          <div className="flex items-center gap-2 text-sm text-ios-secondary">
            <CreditCard className="w-4 h-4" />
            Charged to your saved Stripe payment method
          </div>
          <a href="/billing" className="text-sm text-wa-green font-medium hover:underline">Manage Billing</a>
        </div>

        {autoRechargeError && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 text-red-600 rounded-apple-lg text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {autoRechargeError}
          </div>
        )}

        <button
          onClick={() =>
            autoRechargeMutation.mutate({
              enabled: rechargeEnabled,
              threshold: parseInt(rechargeThreshold, 10) || 1000,
              amount: parseInt(rechargeAmount, 10) || 5000,
            })
          }
          disabled={autoRechargeMutation.isPending}
          className="w-full py-2.5 bg-wa-gradient text-white rounded-apple-lg font-semibold disabled:opacity-50"
        >
          {autoRechargeMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Transaction History */}
      <div className="card-apple p-6">
        <h2 className="text-lg font-semibold text-ios-dark mb-4">Transaction History</h2>

        {transactions.length === 0 ? (
          <div className="text-center py-8 text-ios-muted">
            <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No transactions yet</p>
            <p className="text-sm">Purchase credits to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 10).map((tx) => {
              const typeInfo = getTypeLabel(tx.type);
              const Icon = typeInfo.icon;
              return (
                <div key={tx.id} className="flex items-center gap-4 p-3 bg-ios-gray/30 rounded-xl">
                  <div className={`w-10 h-10 rounded-xl ${typeInfo.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${typeInfo.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-ios-dark">{typeInfo.label}</p>
                    <p className="text-sm text-ios-muted">{tx.description || tx.type}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${typeInfo.color}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-ios-muted">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
