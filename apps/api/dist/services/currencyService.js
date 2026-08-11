/**
 * Currency Service — Currency conversion for WhatsApp API pricing
 *
 * Meta WhatsApp Business Platform supports multiple billing currencies.
 * This service handles conversion between currencies for display purposes.
 *
 * Note: These are indicative rates. For production, integrate with a
 * real-time forex API like Open Exchange Rates, ExchangeRate-API, or Fixer.io
 */
// ============================================
// SUPPORTED CURRENCIES (Meta Billing)
// ============================================
export const CURRENCIES = {
    USD: {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimalPlaces: 4,
        countries: ['US', 'CA', 'AR', 'BR', 'CL', 'CO', 'MX', 'PE', 'EG', 'HK', 'IL', 'RU', 'TR', 'NG', 'ZA', 'OTHER', 'ROW_AF', 'ROW_AP', 'ROW_LATAM', 'ROW_ME'],
    },
    EUR: {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        decimalPlaces: 4,
        countries: ['DE', 'ES', 'FR', 'IT', 'NL', 'PL', 'ROW_WEU', 'ROW_EEU'],
    },
    GBP: {
        code: 'GBP',
        name: 'British Pound',
        symbol: '£',
        decimalPlaces: 4,
        countries: ['GB'],
    },
    INR: {
        code: 'INR',
        name: 'Indian Rupee',
        symbol: '₹',
        decimalPlaces: 2,
        countries: ['IN'],
    },
    AED: {
        code: 'AED',
        name: 'UAE Dirham',
        symbol: 'د.إ',
        decimalPlaces: 4,
        countries: ['AE'],
    },
    SAR: {
        code: 'SAR',
        name: 'Saudi Riyal',
        symbol: '﷼',
        decimalPlaces: 4,
        countries: ['SA'],
    },
    MYR: {
        code: 'MYR',
        name: 'Malaysian Ringgit',
        symbol: 'RM',
        decimalPlaces: 4,
        countries: ['MY'],
    },
    PHP: {
        code: 'PHP',
        name: 'Philippine Peso',
        symbol: '₱',
        decimalPlaces: 2,
        countries: ['PH'],
    },
    IDR: {
        code: 'IDR',
        name: 'Indonesian Rupiah',
        symbol: 'Rp',
        decimalPlaces: 0,
        countries: ['ID'],
    },
    PKR: {
        code: 'PKR',
        name: 'Pakistani Rupee',
        symbol: '₨',
        decimalPlaces: 2,
        countries: ['PK'],
    },
    THB: {
        code: 'THB',
        name: 'Thai Baht',
        symbol: '฿',
        decimalPlaces: 2,
        countries: ['TH'],
    },
    VND: {
        code: 'VND',
        name: 'Vietnamese Dong',
        symbol: '₫',
        decimalPlaces: 0,
        countries: ['VN'],
    },
    SGD: {
        code: 'SGD',
        name: 'Singapore Dollar',
        symbol: 'S$',
        decimalPlaces: 4,
        countries: ['SG'],
    },
};
// ============================================
// EXCHANGE RATES (base: USD)
// Rates updated: July 2026
// For production: use real-time API (Open Exchange Rates, Fixer.io, etc.)
// ============================================
export const EXCHANGE_RATES = {
    // Base USD = 1
    USD: 1.0,
    // EUR zone
    EUR: 0.92, // 1 USD = 0.92 EUR
    GBP: 0.79, // 1 USD = 0.79 GBP
    // Asian currencies
    INR: 83.85, // 1 USD = 83.85 INR
    AED: 3.67, // 1 USD = 3.67 AED
    SAR: 3.75, // 1 USD = 3.75 SAR
    MYR: 4.72, // 1 USD = 4.72 MYR
    PHP: 58.50, // 1 USD = 58.50 PHP
    IDR: 16450, // 1 USD = 16,450 IDR
    PKR: 278.50, // 1 USD = 278.50 PKR
    THB: 35.80, // 1 USD = 35.80 THB
    VND: 24850, // 1 USD = 24,850 VND
    SGD: 1.35, // 1 USD = 1.35 SGD
};
// ============================================
// DISPLAY CURRENCIES (for user preference)
// ============================================
export const DISPLAY_CURRENCIES = {
    USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 4 },
    EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 4 },
    GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 4 },
    INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2 },
    AED: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2 },
    SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalPlaces: 2 },
    BRL: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimalPlaces: 2 },
    MXN: { code: 'MXN', name: 'Mexican Peso', symbol: '$', decimalPlaces: 2 },
    COP: { code: 'COP', name: 'Colombian Peso', symbol: '$', decimalPlaces: 2 },
    ARS: { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimalPlaces: 2 },
    PEN: { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimalPlaces: 2 },
    CLP: { code: 'CLP', name: 'Chilean Peso', symbol: '$', decimalPlaces: 0 },
    NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimalPlaces: 2 },
    ZAR: { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalPlaces: 2 },
    PKR: { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimalPlaces: 2 },
    BDT: { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', decimalPlaces: 2 },
    PHP: { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimalPlaces: 2 },
    MYR: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimalPlaces: 2 },
    THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalPlaces: 2 },
    IDR: { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalPlaces: 0 },
    VND: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: 0 },
    SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2 },
    HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimalPlaces: 2 },
    JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0 },
    CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2 },
    KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimalPlaces: 0 },
    RUB: { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimalPlaces: 2 },
    TRY: { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimalPlaces: 2 },
    ILS: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', decimalPlaces: 2 },
    PLN: { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimalPlaces: 2 },
    CZK: { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimalPlaces: 2 },
    BGN: { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', decimalPlaces: 2 },
    RON: { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimalPlaces: 2 },
    HUF: { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimalPlaces: 2 },
    EGP: { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimalPlaces: 2 },
};
// ============================================
// CURRENCY CONVERSION FUNCTIONS
// ============================================
/**
 * Convert amount from one currency to another
 * @param amount Amount in source currency
 * @param from Source currency code
 * @param to Target currency code
 * @returns Converted amount
 */
export function convertCurrency(amount, from, to) {
    if (from === to)
        return amount;
    const fromRate = EXCHANGE_RATES[from];
    const toRate = EXCHANGE_RATES[to];
    if (!fromRate || !toRate) {
        console.warn(`Currency conversion: ${from} or ${to} not found, returning original`);
        return amount;
    }
    // Convert to USD first, then to target currency
    const usdAmount = amount / fromRate;
    return usdAmount * toRate;
}
/**
 * Format amount in specific currency
 */
export function formatCurrency(amount, currencyCode, options) {
    const currency = DISPLAY_CURRENCIES[currencyCode] || DISPLAY_CURRENCIES.USD;
    const decimals = currency.decimalPlaces;
    let formatted;
    if (options?.compact && amount >= 1000) {
        // Compact format: 1,500 -> 1.5K, 1,500,000 -> 1.5M
        if (amount >= 1_000_000_000) {
            formatted = `${(amount / 1_000_000_000).toFixed(1)}B`;
        }
        else if (amount >= 1_000_000) {
            formatted = `${(amount / 1_000_000).toFixed(1)}M`;
        }
        else if (amount >= 1_000) {
            formatted = `${(amount / 1_000).toFixed(1)}K`;
        }
        else {
            formatted = amount.toFixed(decimals);
        }
    }
    else {
        formatted = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(amount);
    }
    if (options?.showSymbol !== false) {
        return `${currency.symbol}${formatted}`;
    }
    return formatted;
}
/**
 * Get currency for a country code
 */
export function getCurrencyForCountry(countryCode) {
    for (const [currencyCode, info] of Object.entries(CURRENCIES)) {
        if (info.countries.includes(countryCode)) {
            return currencyCode;
        }
    }
    return 'USD'; // Default
}
/**
 * Get billing currency for a Meta message
 * Meta charges in the destination country's local currency
 */
export function getMetaBillingCurrency(countryCode) {
    return getCurrencyForCountry(countryCode);
}
/**
 * Convert WhatsApp API cost (in credits) to display currency
 * Credits = USD * 10000 (1 credit = $0.0001)
 *
 * @param credits Credit amount
 * @param displayCurrency Currency to display in
 * @returns Formatted string with converted amount
 */
export function convertMessageCost(credits, displayCurrency = 'USD') {
    const usd = credits / 10000;
    const converted = convertCurrency(usd, 'USD', displayCurrency);
    const currency = DISPLAY_CURRENCIES[displayCurrency] || DISPLAY_CURRENCIES.USD;
    return {
        credits,
        usd,
        converted,
        currency: displayCurrency,
        formatted: formatCurrency(converted, displayCurrency, { showSymbol: true }),
    };
}
/**
 * Get exchange rate info between two currencies
 */
export function getExchangeRate(from, to) {
    const fromRate = EXCHANGE_RATES[from] || 1;
    const toRate = EXCHANGE_RATES[to] || 1;
    const rate = toRate / fromRate;
    return {
        from,
        to,
        rate,
        inverseRate: 1 / rate,
        lastUpdated: '2026-07-16',
    };
}
/**
 * Get all available display currencies
 */
export function getDisplayCurrencies() {
    return Object.values(DISPLAY_CURRENCIES).map(c => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
    }));
}
/**
 * Convert credit amount to a bundle description
 * e.g., 5000 credits in INR for India
 */
export function getMessageCostInLocalCurrency(credits, countryCode) {
    const localCurrency = getCurrencyForCountry(countryCode);
    const usd = credits / 10000;
    const localAmount = convertCurrency(usd, 'USD', localCurrency);
    return {
        credits,
        localCurrency,
        localAmount,
        localFormatted: formatCurrency(localAmount, localCurrency, { showSymbol: true }),
        usdAmount: usd,
        usdFormatted: formatCurrency(usd, 'USD', { showSymbol: true }),
    };
}
//# sourceMappingURL=currencyService.js.map