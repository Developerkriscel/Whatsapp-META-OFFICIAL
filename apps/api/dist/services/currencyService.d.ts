/**
 * Currency Service — Currency conversion for WhatsApp API pricing
 *
 * Meta WhatsApp Business Platform supports multiple billing currencies.
 * This service handles conversion between currencies for display purposes.
 *
 * Note: These are indicative rates. For production, integrate with a
 * real-time forex API like Open Exchange Rates, ExchangeRate-API, or Fixer.io
 */
export declare const CURRENCIES: Record<string, {
    code: string;
    name: string;
    symbol: string;
    decimalPlaces: number;
    countries: string[];
}>;
export declare const EXCHANGE_RATES: Record<string, number>;
export declare const DISPLAY_CURRENCIES: Record<string, {
    code: string;
    name: string;
    symbol: string;
    decimalPlaces: number;
}>;
/**
 * Convert amount from one currency to another
 * @param amount Amount in source currency
 * @param from Source currency code
 * @param to Target currency code
 * @returns Converted amount
 */
export declare function convertCurrency(amount: number, from: string, to: string): number;
/**
 * Format amount in specific currency
 */
export declare function formatCurrency(amount: number, currencyCode: string, options?: {
    showSymbol?: boolean;
    compact?: boolean;
}): string;
/**
 * Get currency for a country code
 */
export declare function getCurrencyForCountry(countryCode: string): string;
/**
 * Get billing currency for a Meta message
 * Meta charges in the destination country's local currency
 */
export declare function getMetaBillingCurrency(countryCode: string): string;
/**
 * Convert WhatsApp API cost (in credits) to display currency
 * Credits = USD * 10000 (1 credit = $0.0001)
 *
 * @param credits Credit amount
 * @param displayCurrency Currency to display in
 * @returns Formatted string with converted amount
 */
export declare function convertMessageCost(credits: number, displayCurrency?: string): {
    credits: number;
    usd: number;
    converted: number;
    currency: string;
    formatted: string;
};
/**
 * Get exchange rate info between two currencies
 */
export declare function getExchangeRate(from: string, to: string): {
    from: string;
    to: string;
    rate: number;
    inverseRate: number;
    lastUpdated: string;
};
/**
 * Get all available display currencies
 */
export declare function getDisplayCurrencies(): Array<{
    code: string;
    name: string;
    symbol: string;
}>;
/**
 * Convert credit amount to a bundle description
 * e.g., 5000 credits in INR for India
 */
export declare function getMessageCostInLocalCurrency(credits: number, countryCode: string): {
    credits: number;
    localCurrency: string;
    localAmount: number;
    localFormatted: string;
    usdAmount: number;
    usdFormatted: string;
};
//# sourceMappingURL=currencyService.d.ts.map