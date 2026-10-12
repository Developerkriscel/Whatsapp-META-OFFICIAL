export const CASHFREE_PLAN_GST_RATE_PERCENT = 18;

export interface CashfreePlanPrice {
  baseMinor: number;
  gstMinor: number;
  totalMinor: number;
}

export function quoteCashfreePlanPrice(amountUsd: number, usdToInr: number): CashfreePlanPrice {
  const baseMinor = Math.round(amountUsd * usdToInr * 100);
  const gstMinor = Math.round((baseMinor * CASHFREE_PLAN_GST_RATE_PERCENT) / 100);

  return {
    baseMinor,
    gstMinor,
    totalMinor: baseMinor + gstMinor,
  };
}
