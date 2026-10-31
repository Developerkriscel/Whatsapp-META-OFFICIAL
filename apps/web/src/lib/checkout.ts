/**
 * Buying credits through Razorpay.
 *
 * The flow is deliberately thin on this side. The server decides the price and
 * the credit count when it creates the order; this opens the gateway with the
 * order id it was given and reports back what happened. Nothing here is trusted
 * to say what was bought.
 *
 * The confirm call is a convenience so the balance updates immediately. The
 * webhook confirms the same purchase independently, so closing the tab
 * mid-payment does not cost anyone their credits.
 */
import { api } from '../api/client';

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
const CASHFREE_SCRIPT = 'https://sdk.cashfree.com/js/v3/cashfree.js';

let scriptPromise: Promise<void> | null = null;
let cashfreeScriptPromise: Promise<void> | null = null;

declare global {
  interface Window {
    Cashfree?: (options: { mode: 'sandbox' | 'production' }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget: '_self' }) => Promise<unknown>;
    };
  }
}

/** Loads Razorpay's checkout script once and reuses it. */
function loadCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser'));
  if ((window as any).Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = CHECKOUT_SCRIPT;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the payment gateway. Check the connection and try again.'));
    };
    document.body.appendChild(el);
  });
  return scriptPromise;
}

function loadCashfreeCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser'));
  if (window.Cashfree) return Promise.resolve();
  if (cashfreeScriptPromise) return cashfreeScriptPromise;

  cashfreeScriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = CASHFREE_SCRIPT;
    el.async = true;
    el.onload = () => {
      if (window.Cashfree) resolve();
      else {
        cashfreeScriptPromise = null;
        reject(new Error('Cashfree checkout did not initialize.'));
      }
    };
    el.onerror = () => {
      cashfreeScriptPromise = null;
      reject(new Error('Could not load Cashfree checkout. Check the connection and try again.'));
    };
    document.body.appendChild(el);
  });
  return cashfreeScriptPromise;
}

export async function openCashfreeCheckout(paymentSessionId: string, testMode: boolean): Promise<void> {
  await loadCashfreeCheckout();
  const cashfree = window.Cashfree?.({ mode: testMode ? 'sandbox' : 'production' });
  if (!cashfree) throw new Error('Cashfree checkout is unavailable.');
  await cashfree.checkout({ paymentSessionId, redirectTarget: '_self' });
}

export interface CheckoutResult {
  status: 'credited' | 'pending' | 'dismissed' | 'failed';
  credits?: number;
  balanceAfter?: number;
  message?: string;
}

export interface CheckoutOptions {
  packageId?: string;
  credits?: number;
  /** Prefills the gateway so the buyer does not retype what we already know. */
  prefill?: { name?: string; email?: string; contact?: string };
  businessName?: string;
}

export interface RazorpayCheckoutOptions {
  keyId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  credits?: number;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  businessName?: string;
  confirmUrl?: string;
}

export async function openRazorpayCheckout(opts: RazorpayCheckoutOptions): Promise<CheckoutResult> {
  await loadCheckout();

  const confirmUrl = opts.confirmUrl || '/credits/checkout/confirm';

  return new Promise<CheckoutResult>((resolve) => {
    const rzp = new (window as any).Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountMinor,
      currency: opts.currency,
      name: opts.businessName || 'Kriscel WA',
      description: opts.description || (opts.credits ? `${opts.credits.toLocaleString('en-IN')} credits` : 'Payment'),
      prefill: opts.prefill || {},
      theme: { color: '#25D366' },

      handler: async (response: any) => {
        try {
          const confirmed = await api.post(confirmUrl, {
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          const d = confirmed.data?.data;
          resolve({
            status: d?.credited || d?.activated ? 'credited' : 'pending',
            credits: d?.credits,
            balanceAfter: d?.balanceAfter,
            message: d?.reason,
          });
        } catch (err: any) {
          resolve({
            status: 'pending',
            message:
              err?.response?.data?.error?.message
              || 'Payment taken, waiting for confirmation. Your balance will update shortly.',
          });
        }
      },

      modal: {
        ondismiss: () => resolve({ status: 'dismissed', message: 'Payment cancelled.' }),
      },
    });

    rzp.on('payment.failed', (resp: any) => {
      resolve({ status: 'failed', message: resp?.error?.description || 'The payment did not go through.' });
    });

    rzp.open();
  });
}

export async function buyCredits(opts: CheckoutOptions): Promise<CheckoutResult> {
  const created = await api.post('/credits/checkout/create-order', {
    packageId: opts.packageId,
    credits: opts.credits,
  });
  const order = created.data?.data;
  if (!order?.orderId) throw new Error('The order could not be created.');

  await loadCheckout();

  return new Promise<CheckoutResult>((resolve) => {
    const rzp = new (window as any).Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountMinor,
      currency: order.currency,
      name: opts.businessName || 'Kriscel WA',
      description: `${order.credits.toLocaleString('en-IN')} credits`,
      prefill: opts.prefill || {},
      theme: { color: '#25D366' },

      handler: async (response: any) => {
        try {
          const confirmed = await api.post('/credits/checkout/confirm', {
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          const d = confirmed.data?.data;
          resolve({
            status: d?.credited ? 'credited' : 'pending',
            credits: d?.credits,
            balanceAfter: d?.balanceAfter,
            message: d?.reason,
          });
        } catch (err: any) {
          // The payment may well have gone through — the webhook decides. Say
          // so rather than reporting a failure that might not be one.
          resolve({
            status: 'pending',
            message:
              err?.response?.data?.error?.message
              || 'Payment taken, waiting for confirmation. Your balance will update shortly.',
          });
        }
      },

      modal: {
        ondismiss: () => resolve({ status: 'dismissed', message: 'Payment cancelled.' }),
      },
    });

    rzp.on('payment.failed', (resp: any) => {
      resolve({ status: 'failed', message: resp?.error?.description || 'The payment did not go through.' });
    });

    rzp.open();
  });
}
