/**
 * Whether a workspace can actually use the product right now.
 *
 * The tenants list rendered TRIAL in the same green as ACTIVE and showed the
 * created date, so a workspace whose trial lapsed three weeks ago looked
 * identical to a healthy one. Meanwhile every request it made was being
 * refused with 402. The panel said fine; the product said no.
 *
 * This mirrors the server's rule exactly (middleware/auth.ts): a trial that has
 * passed its end date, with no Stripe subscription, is locked out — whatever
 * the status column says. Keep the two in step; a panel that disagrees with the
 * gate is worse than no panel, because it is trusted.
 */

export type AccessState = 'active' | 'trialing' | 'trial_expired' | 'suspended' | 'other';

export interface TenantLike {
  status?: string | null;
  trialEndsAt?: string | Date | null;
  stripeSubId?: string | null;
}

export interface Access {
  state: AccessState;
  /** True when the server will refuse this workspace's requests. */
  lockedOut: boolean;
  label: string;
  /** Tailwind classes for the badge. */
  className: string;
  /** Negative once the deadline has passed. Null when no trial applies. */
  daysLeft: number | null;
  detail: string | null;
}

const DAY = 86_400_000;

export function tenantAccess(t: TenantLike): Access {
  const status = String(t.status || '').toUpperCase();
  const hasSub = !!t.stripeSubId;
  const ends = t.trialEndsAt ? new Date(t.trialEndsAt) : null;
  const daysLeft = ends ? Math.ceil((ends.getTime() - Date.now()) / DAY) : null;

  if (status === 'SUSPENDED') {
    return {
      state: 'suspended', lockedOut: true, label: 'Suspended',
      className: 'bg-apple-red/15 text-apple-red', daysLeft, detail: 'Suspended by an admin',
    };
  }

  if (status === 'TRIAL' && !hasSub && ends && ends.getTime() < Date.now()) {
    const ago = Math.abs(daysLeft ?? 0);
    return {
      state: 'trial_expired', lockedOut: true, label: 'Trial expired',
      className: 'bg-apple-red/15 text-apple-red',
      daysLeft,
      detail: ago === 0 ? 'Trial ended today' : `Trial ended ${ago} day${ago === 1 ? '' : 's'} ago`,
    };
  }

  if (status === 'TRIAL') {
    return {
      state: 'trialing', lockedOut: false,
      label: hasSub ? 'Active' : 'Trial',
      // Amber, not green: a trial is working but on a clock, and the two should
      // not look the same at a glance.
      className: hasSub ? 'bg-wa-green/20 text-wa-green' : 'bg-apple-orange/15 text-apple-orange',
      daysLeft,
      detail: hasSub
        ? 'Subscribed'
        : daysLeft != null
          ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
          : 'No trial end set',
    };
  }

  if (status === 'ACTIVE') {
    return {
      state: 'active', lockedOut: false, label: 'Active',
      className: 'bg-wa-green/20 text-wa-green', daysLeft, detail: null,
    };
  }

  return {
    state: 'other', lockedOut: false,
    label: status ? status.replace(/_/g, ' ').toLowerCase() : 'Unknown',
    className: 'bg-ios-gray text-ios-secondary', daysLeft, detail: null,
  };
}
