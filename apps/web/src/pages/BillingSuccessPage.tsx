/**
 * Billing Success Page - lands here after Stripe Checkout redirect
 * Reconciles the subscription immediately rather than waiting on the webhook.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function BillingSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setStatus('error');
      setMessage('No checkout session found.');
      return;
    }

    api.get('/billing/success', { params: { session_id: sessionId } })
      .then((res) => {
        if (res.data?.data?.reconciled) {
          setStatus('success');
          setMessage('Your subscription is now active.');
        } else {
          setStatus('error');
          setMessage(res.data?.data?.message || 'Payment is still processing. Check back shortly.');
        }
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error?.message || 'Could not confirm your subscription.');
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-ios-background flex items-center justify-center p-4">
      <div className="card-apple p-8 max-w-sm w-full text-center">
        {status === 'pending' && (
          <>
            <Loader2 className="w-10 h-10 text-wa-green animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold text-ios-dark">Confirming your subscription…</h1>
            <p className="text-sm text-ios-secondary mt-2">This will only take a moment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 bg-apple-green/20 text-apple-green rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-bold text-ios-dark">Subscription active</h1>
            <p className="text-sm text-ios-secondary mt-2">{message}</p>
            <button
              onClick={() => navigate('/billing')}
              className="mt-6 w-full py-3 bg-wa-green text-white font-semibold rounded-apple-lg hover:bg-wa-green/90 transition"
            >
              Go to Billing
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-14 h-14 bg-apple-orange/20 text-apple-orange rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-bold text-ios-dark">We couldn't confirm this yet</h1>
            <p className="text-sm text-ios-secondary mt-2">{message}</p>
            <Link
              to="/billing"
              className="mt-6 inline-block w-full py-3 bg-wa-green text-white font-semibold rounded-apple-lg hover:bg-wa-green/90 transition"
            >
              Back to Billing
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
