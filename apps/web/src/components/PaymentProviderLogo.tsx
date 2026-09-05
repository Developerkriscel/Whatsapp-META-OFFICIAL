/**
 * Provider marks for the payment settings list.
 *
 * These are brand-coloured letterforms, not reproductions of the official
 * logos: the app is offline-first and the CSP blocks remote images, so a real
 * asset would have to be bundled, and an approximated official logo drawn from
 * memory would be worse than an honest mark. Each is recognisable by colour and
 * initial, which is what the list needs — telling six providers apart at a
 * glance.
 */

const BRAND: Record<string, { bg: string; fg: string; mark: string; full: string }> = {
  razorpay: { bg: '#0C2451', fg: '#3395FF', mark: 'R', full: 'Razorpay' },
  stripe:   { bg: '#635BFF', fg: '#FFFFFF', mark: 'S', full: 'Stripe' },
  payu:     { bg: '#0B3B5D', fg: '#A6CE39', mark: 'P', full: 'PayU' },
  cashfree: { bg: '#0B2545', fg: '#00C7B1', mark: 'C', full: 'Cashfree' },
  phonepe:  { bg: '#5F259F', fg: '#FFFFFF', mark: 'Pe', full: 'PhonePe' },
  paytm:    { bg: '#012B72', fg: '#00BAF2', mark: 'Pa', full: 'Paytm' },
};

export default function PaymentProviderLogo({
  provider,
  size = 40,
  muted = false,
}: {
  provider: string;
  size?: number;
  muted?: boolean;
}) {
  const b = BRAND[provider] ?? { bg: '#E5E7EB', fg: '#6B7280', mark: '?', full: provider };
  // An unconfigured provider is shown in grey so the list reads at a glance as
  // "these are live, these are not".
  const bg = muted ? '#F1F3F5' : b.bg;
  const fg = muted ? '#9AA0A6' : b.fg;

  return (
    <span
      role="img"
      aria-label={b.full}
      title={b.full}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: size * (b.mark.length > 1 ? 0.34 : 0.44),
      }}
      className="inline-flex items-center justify-center rounded-apple-lg font-bold shrink-0 select-none transition-colors"
    >
      {b.mark}
    </span>
  );
}
