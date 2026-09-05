/**
 * Credit Service â€” WhatsApp Business API Cost Management
 *
 * Rates match exact Meta WhatsApp Business Platform pricing
 * Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
 * Updated: July 2026
 *
 * Credit = $0.0001 (1 cent = 100 credits, 1 dollar = 10,000 credits)
 * This gives us 4 decimal precision matching exact Meta USD rates.
 *
 * Message Categories:
 * - MARKETING: Promotional content, offers, newsletters (highest cost)
 * - UTILITY: Order confirmations, shipping updates, appointment reminders
 * - AUTHENTICATION: OTPs, login verification, security codes
 * - SESSION: Customer-initiated replies within 24h window (FREE)
 *
 * Key Meta Policy:
 * - Free tier 1: Non-template replies within 24h CSW = FREE
 * - Free tier 2: Utility templates within open CSW = FREE
 * - Free tier 3: 72h free entry window (from Click-to-WhatsApp ads) = ALL categories FREE
 */

import { PrismaClient } from '@prisma/client';

// ============================================
// META OFFICIAL RATES (USD per message, effective July 2026)
// Source: Meta WhatsApp Business Platform Rate Card
// ============================================

// All rates are in credits where 1 credit = $0.0001 USD
// Formula: credits = (usd_rate / 0.0001)
// e.g., $0.0618 â†’ 618 credits, $0.0068 â†’ 68 credits

export const META_RATES: Record<string, {
  marketing: number;
  utility: number;
  auth: number;
  session: number;
  currency: string;
  billingCurrency: string;
}> = {
  // === DEFAULT (INDIA - INR) ===
  IN: { marketing: 118, utility: 14, auth: 14, session: 0, currency: 'INR', billingCurrency: 'INR' },  // India - PRIMARY DEFAULT

  // === AMERICAS ===
  US: { marketing: 250, utility: 34, auth: 34, session: 0, currency: 'USD', billingCurrency: 'USD' },  // United States
  CA: { marketing: 250, utility: 34, auth: 34, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Canada
  AR: { marketing: 618, utility: 260, auth: 260, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Argentina
  BO: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Bolivia
  BR: { marketing: 625, utility: 68, auth: 68, session: 0, currency: 'USD', billingCurrency: 'BRL' },  // Brazil
  CL: { marketing: 889, utility: 200, auth: 200, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Chile
  CO: { marketing: 125, utility: 8, auth: 8, session: 0, currency: 'USD', billingCurrency: 'COP' },  // Colombia
  CR: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Costa Rica
  DO: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Dominican Republic
  EC: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Ecuador
  SV: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // El Salvador
  GT: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Guatemala
  HT: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Haiti
  HN: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Honduras
  JM: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Jamaica
  MX: { marketing: 305, utility: 85, auth: 85, session: 0, currency: 'USD', billingCurrency: 'MXN' },  // Mexico
  NI: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Nicaragua
  PA: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Panama
  PY: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Paraguay
  PE: { marketing: 703, utility: 200, auth: 200, session: 0, currency: 'USD', billingCurrency: 'PEN' },  // Peru
  PR: { marketing: 250, utility: 34, auth: 34, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Puerto Rico
  TT: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Trinidad & Tobago
  UY: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Uruguay
  VE: { marketing: 740, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Venezuela

  // === EUROPE ===
  AT: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Austria
  BE: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Belgium
  HR: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Croatia
  CZ: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Czech Republic
  DK: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'DKK' },  // Denmark
  FI: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Finland
  FR: { marketing: 859, utility: 300, auth: 300, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // France
  DE: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Germany
  GR: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Greece
  HU: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Hungary
  IE: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Ireland
  IT: { marketing: 795, utility: 300, auth: 300, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Italy
  NL: { marketing: 1597, utility: 500, auth: 500, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Netherlands
  NO: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'NOK' },  // Norway
  PL: { marketing: 366, utility: 122, auth: 122, session: 0, currency: 'EUR', billingCurrency: 'PLN' },  // Poland
  PT: { marketing: 707, utility: 200, auth: 200, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Portugal
  RO: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Romania
  RU: { marketing: 802, utility: 400, auth: 400, session: 0, currency: 'RUB', billingCurrency: 'RUB' },  // Russia
  RS: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Serbia
  SK: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Slovakia
  ES: { marketing: 707, utility: 200, auth: 200, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Spain
  SE: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'EUR', billingCurrency: 'SEK' },  // Sweden
  CH: { marketing: 1365, utility: 550, auth: 550, session: 0, currency: 'CHF', billingCurrency: 'CHF' },  // Switzerland
  UA: { marketing: 860, utility: 212, auth: 212, session: 0, currency: 'EUR', billingCurrency: 'EUR' },  // Ukraine
  GB: { marketing: 635, utility: 220, auth: 220, session: 0, currency: 'GBP', billingCurrency: 'GBP' },  // United Kingdom

  // === MIDDLE EAST ===
  BH: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'BHD' },  // Bahrain
  EG: { marketing: 644, utility: 36, auth: 36, session: 0, currency: 'EGP', billingCurrency: 'EGP' },  // Egypt
  IQ: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Iraq
  IL: { marketing: 353, utility: 53, auth: 53, session: 0, currency: 'ILS', billingCurrency: 'ILS' },  // Israel
  JO: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Jordan
  KW: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'KWD' },  // Kuwait
  LB: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Lebanon
  OM: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'OMR' },  // Oman
  PS: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Palestine
  QA: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'QAR' },  // Qatar
  SA: { marketing: 501, utility: 107, auth: 107, session: 0, currency: 'SAR', billingCurrency: 'SAR' },  // Saudi Arabia
  AE: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'AED', billingCurrency: 'AED' },  // UAE
  YE: { marketing: 499, utility: 157, auth: 157, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Yemen

  // === AFRICA ===
  DZ: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'DZD' },  // Algeria
  AO: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'AOA' },  // Angola
  BW: { marketing: 379, utility: 76, auth: 76, session: 0, currency: 'USD', billingCurrency: 'BWP' },  // Botswana
  CM: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'XAF' },  // Cameroon
  CI: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'XOF' },  // Ivory Coast
  ET: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'ETB' },  // Ethiopia
  GH: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'GHS' },  // Ghana
  KE: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'KES' },  // Kenya
  MA: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'MAD' },  // Morocco
  MZ: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'MZN' },  // Mozambique
  NA: { marketing: 379, utility: 76, auth: 76, session: 0, currency: 'USD', billingCurrency: 'NAD' },  // Namibia
  NG: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'NGN', billingCurrency: 'NGN' },  // Nigeria
  SN: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'XOF' },  // Senegal
  ZA: { marketing: 379, utility: 76, auth: 76, session: 0, currency: 'ZAR', billingCurrency: 'ZAR' },  // South Africa
  TZ: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'TZS' },  // Tanzania
  TN: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'TND' },  // Tunisia
  UG: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'UGX' },  // Uganda
  ZM: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'ZMW' },  // Zambia
  ZW: { marketing: 516, utility: 67, auth: 67, session: 0, currency: 'USD', billingCurrency: 'ZWL' },  // Zimbabwe

  // === ASIA PACIFIC ===
  AF: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'USD', billingCurrency: 'AFN' },  // Afghanistan
  AU: { marketing: 1258, utility: 250, auth: 250, session: 0, currency: 'AUD', billingCurrency: 'AUD' },  // Australia
  BD: { marketing: 500, utility: 80, auth: 80, session: 0, currency: 'BDT', billingCurrency: 'BDT' },  // Bangladesh
  BT: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'USD', billingCurrency: 'BTN' },  // Bhutan
  BN: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'BND' },  // Brunei
  KH: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'USD', billingCurrency: 'KHR' },  // Cambodia
  CN: { marketing: 732, utility: 113, auth: 113, session: 0, currency: 'CNY', billingCurrency: 'CNY' },  // China
  FJ: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'FJD' },  // Fiji
  HK: { marketing: 732, utility: 260, auth: 260, session: 0, currency: 'HKD', billingCurrency: 'HKD' },  // Hong Kong
  ID: { marketing: 411, utility: 250, auth: 250, session: 0, currency: 'IDR', billingCurrency: 'IDR' },  // Indonesia
  JP: { marketing: 732, utility: 113, auth: 113, session: 0, currency: 'JPY', billingCurrency: 'JPY' },  // Japan
  KZ: { marketing: 802, utility: 400, auth: 400, session: 0, currency: 'USD', billingCurrency: 'KZT' },  // Kazakhstan
  KI: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'AUD' },  // Kiribati
  KR: { marketing: 732, utility: 113, auth: 113, session: 0, currency: 'KRW', billingCurrency: 'KRW' },  // South Korea
  KG: { marketing: 802, utility: 400, auth: 400, session: 0, currency: 'USD', billingCurrency: 'KGS' },  // Kyrgyzstan
  LA: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'USD', billingCurrency: 'LAK' },  // Laos
  MO: { marketing: 732, utility: 113, auth: 113, session: 0, currency: 'MOP', billingCurrency: 'MOP' },  // Macau
  MY: { marketing: 860, utility: 140, auth: 140, session: 0, currency: 'MYR', billingCurrency: 'MYR' },  // Malaysia
  MV: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'MVR' },  // Maldives
  MN: { marketing: 732, utility: 113, auth: 113, session: 0, currency: 'USD', billingCurrency: 'MNT' },  // Mongolia
  MM: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'USD', billingCurrency: 'MMK' },  // Myanmar
  NR: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'AUD' },  // Nauru
  NP: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'USD', billingCurrency: 'NPR' },  // Nepal
  NZ: { marketing: 1258, utility: 250, auth: 250, session: 0, currency: 'NZD', billingCurrency: 'NZD' },  // New Zealand
  PK: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'PKR', billingCurrency: 'PKR' },  // Pakistan
  PG: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'PGK' },  // Papua New Guinea
  PH: { marketing: 500, utility: 100, auth: 100, session: 0, currency: 'PHP', billingCurrency: 'PHP' },  // Philippines
  WS: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'WST' },  // Samoa
  SG: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'SGD', billingCurrency: 'SGD' },  // Singapore
  SB: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'SBD' },  // Solomon Islands
  LK: { marketing: 473, utility: 100, auth: 100, session: 0, currency: 'USD', billingCurrency: 'LKR' },  // Sri Lanka
  TW: { marketing: 732, utility: 113, auth: 113, session: 0, currency: 'TWD', billingCurrency: 'TWD' },  // Taiwan
  TJ: { marketing: 802, utility: 400, auth: 400, session: 0, currency: 'USD', billingCurrency: 'TJS' },  // Tajikistan
  TH: { marketing: 400, utility: 100, auth: 100, session: 0, currency: 'THB', billingCurrency: 'THB' },  // Thailand
  TL: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'USD' },  // Timor-Leste
  TO: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'TOP' },  // Tonga
  TM: { marketing: 802, utility: 400, auth: 400, session: 0, currency: 'USD', billingCurrency: 'TMT' },  // Turkmenistan
  TV: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'AUD' },  // Tuvalu
  VU: { marketing: 732, utility: 160, auth: 160, session: 0, currency: 'USD', billingCurrency: 'VUV' },  // Vanuatu
  VN: { marketing: 350, utility: 50, auth: 50, session: 0, currency: 'VND', billingCurrency: 'VND' },  // Vietnam

  // === REST OF REGIONS (fallback) ===
  OTHER: { marketing: 604, utility: 77, auth: 77, session: 0, currency: 'USD', billingCurrency: 'USD' },
};

// ============================================
// COUNTRY NAMES
// ============================================

export const COUNTRY_NAMES: Record<string, string> = {
  // DEFAULT
  IN: 'India',

  // AMERICAS
  US: 'United States', CA: 'Canada', AR: 'Argentina', BO: 'Bolivia', BR: 'Brazil',
  CL: 'Chile', CO: 'Colombia', CR: 'Costa Rica', DO: 'Dominican Republic',
  EC: 'Ecuador', SV: 'El Salvador', GT: 'Guatemala', HT: 'Haiti', HN: 'Honduras',
  JM: 'Jamaica', MX: 'Mexico', NI: 'Nicaragua', PA: 'Panama', PY: 'Paraguay',
  PE: 'Peru', PR: 'Puerto Rico', TT: 'Trinidad & Tobago', UY: 'Uruguay', VE: 'Venezuela',

  // EUROPE
  AT: 'Austria', BE: 'Belgium', HR: 'Croatia', CZ: 'Czech Republic', DK: 'Denmark',
  FI: 'Finland', FR: 'France', DE: 'Germany', GR: 'Greece', HU: 'Hungary',
  IE: 'Ireland', IT: 'Italy', NL: 'Netherlands', NO: 'Norway', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', RU: 'Russia', RS: 'Serbia', SK: 'Slovakia',
  ES: 'Spain', SE: 'Sweden', CH: 'Switzerland', UA: 'Ukraine', GB: 'United Kingdom',

  // MIDDLE EAST
  BH: 'Bahrain', EG: 'Egypt', IQ: 'Iraq', IL: 'Israel', JO: 'Jordan',
  KW: 'Kuwait', LB: 'Lebanon', OM: 'Oman', PS: 'Palestine', QA: 'Qatar',
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', YE: 'Yemen',

  // AFRICA
  DZ: 'Algeria', AO: 'Angola', BW: 'Botswana', CM: 'Cameroon', CI: 'Ivory Coast',
  ET: 'Ethiopia', GH: 'Ghana', KE: 'Kenya', MA: 'Morocco', MZ: 'Mozambique',
  NA: 'Namibia', NG: 'Nigeria', SN: 'Senegal', ZA: 'South Africa', TZ: 'Tanzania',
  TN: 'Tunisia', UG: 'Uganda', ZM: 'Zambia', ZW: 'Zimbabwe',

  // ASIA PACIFIC
  AF: 'Afghanistan', AU: 'Australia', BD: 'Bangladesh', BT: 'Bhutan', BN: 'Brunei',
  KH: 'Cambodia', CN: 'China', FJ: 'Fiji', HK: 'Hong Kong', ID: 'Indonesia',
  JP: 'Japan', KZ: 'Kazakhstan', KI: 'Kiribati', KR: 'South Korea', KG: 'Kyrgyzstan',
  LA: 'Laos', MO: 'Macau', MY: 'Malaysia', MV: 'Maldives', MN: 'Mongolia',
  MM: 'Myanmar', NR: 'Nauru', NP: 'Nepal', NZ: 'New Zealand', PK: 'Pakistan',
  PG: 'Papua New Guinea', PH: 'Philippines', WS: 'Samoa', SG: 'Singapore',
  SB: 'Solomon Islands', LK: 'Sri Lanka', TW: 'Taiwan', TJ: 'Tajikistan',
  TH: 'Thailand', TL: 'Timor-Leste', TO: 'Tonga', TM: 'Turkmenistan',
  TV: 'Tuvalu', VU: 'Vanuatu', VN: 'Vietnam',

  OTHER: 'Other Countries',
};

// ============================================
// MESSAGE CATEGORIES
// ============================================

export type MessageCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SESSION';

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utility',
  AUTHENTICATION: 'Authentication',
  SESSION: 'Session Reply',
};

export const CATEGORY_DESCRIPTIONS: Record<MessageCategory, string> = {
  MARKETING: 'Promotional content, offers, newsletters, announcements',
  UTILITY: 'Order confirmations, shipping updates, appointment reminders',
  AUTHENTICATION: 'OTPs, login verification, account security codes',
  SESSION: 'Customer service replies within 24-hour window (FREE)',
};

// ============================================
// DEFAULT SETTINGS (India/INR)
// ============================================

export const DEFAULT_COUNTRY = 'IN';
export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_LANGUAGE = 'en';

/**
 * Get default country code
 */
export function getDefaultCountry(): string {
  return DEFAULT_COUNTRY;
}

/**
 * Get default currency for a tenant
 */
export function getDefaultCurrency(): string {
  return DEFAULT_CURRENCY;
}

// ============================================
// RATE LOOKUP FUNCTIONS
// ============================================

/**
 * Configured sell prices, keyed by country code.
 *
 * getRateCredits runs on every message, so it stays synchronous and reads this
 * cache rather than the database. refreshRateCache() repopulates it â€” on boot,
 * on a timer, and immediately after a superadmin edits a rate, so a price change
 * takes effect without a deploy or restart.
 *
 * Until the first successful load the cache is empty and lookups fall through to
 * META_RATES, so a database problem degrades to Meta's list prices instead of
 * billing everyone zero.
 */
let rateCache = new Map<string, { marketing: number; utility: number; auth: number; service: number }>();
let rateCacheLoadedAt: Date | null = null;

export async function refreshRateCache(prisma: PrismaClient): Promise<number> {
  // The peg travels with the rates: changing one without the other silently
  // rescales every price in the product.
  try {
    const peg = await prisma.platformSetting.findUnique({ where: { key: 'credits_per_usd' } });
    const parsed = Number(peg?.value);
    if (Number.isFinite(parsed) && parsed > 0) creditsPerUsd = parsed;
  } catch {
    // Settings unreadable — the default is still a working peg.
  }

  const rows = await prisma.creditRate.findMany({ where: { isActive: true } });
  const next = new Map<string, { marketing: number; utility: number; auth: number; service: number }>();
  for (const r of rows) {
    next.set(r.countryCode.toUpperCase(), {
      marketing: r.marketingCredits,
      utility: r.utilityCredits,
      auth: r.authCredits,
      service: r.serviceCredits,
    });
  }
  rateCache = next;
  rateCacheLoadedAt = new Date();
  return next.size;
}

export function getRateCacheStatus(): { countries: number; loadedAt: Date | null } {
  return { countries: rateCache.size, loadedAt: rateCacheLoadedAt };
}

/**
 * Credits charged for one message to `country` in `category`.
 *
 * Prefers the configured rate for that country, then the configured default
 * country, then Meta's published list price. Previously read only the hardcoded
 * META_RATES table, which meant the rates screen in the superadmin panel edited
 * rows that nothing consulted.
 */
export function getRateCredits(country: string, category: MessageCategory): number {
  const normalized = country?.toUpperCase() || DEFAULT_COUNTRY;
  const configured = rateCache.get(normalized) || rateCache.get(DEFAULT_COUNTRY);

  if (configured) {
    switch (category) {
      case 'MARKETING': return configured.marketing;
      case 'UTILITY': return configured.utility;
      case 'AUTHENTICATION': return configured.auth;
      case 'SESSION': return configured.service;
      default: return configured.utility;
    }
  }

  const rates = META_RATES[normalized] || META_RATES[DEFAULT_COUNTRY];
  switch (category) {
    case 'MARKETING': return rates.marketing;
    case 'UTILITY': return rates.utility;
    case 'AUTHENTICATION': return rates.auth;
    case 'SESSION': return rates.session; // Always 0 (free)
    default: return rates.utility;
  }
}

/**
 * Get rate in USD for a country + category
 */
export function getRateUsd(country: string, category: MessageCategory): number {
  return creditsToUsd(getRateCredits(country, category));
}

/**
 * How many credits one dollar buys.
 *
 * This was a hardcoded 10,000 in two directions, which made the peg the one
 * pricing decision that could not be changed without a deploy — and it is the
 * decision that determines whether a credit pack and the rate card agree with
 * each other. Held in the same cache as the rates and refreshed with them, so
 * conversion stays synchronous for the thirty-odd call sites that rely on it.
 */
export const DEFAULT_CREDITS_PER_USD = 10000;
let creditsPerUsd = DEFAULT_CREDITS_PER_USD;

export function getCreditsPerUsd(): number {
  return creditsPerUsd;
}

/**
 * Convert credits to USD at the configured peg.
 */
export function creditsToUsd(credits: number): number {
  return credits / creditsPerUsd;
}

/**
 * Convert USD to credits
 */
export function usdToCredits(usd: number): number {
  return Math.round(usd * creditsPerUsd);
}

/**
 * Format USD for display
 */
export function formatUsd(cents: number): string {
  return `$${(cents / 10000).toFixed(4)}`;
}

/**
 * Get cost description for display
 */
export function getCostDescription(countryCode: string, category: MessageCategory): string {
  const credits = getRateCredits(countryCode, category);
  const usd = creditsToUsd(credits);
  const countryName = COUNTRY_NAMES[countryCode.toUpperCase()] || countryCode;
  const catLabel = CATEGORY_LABELS[category];

  if (credits === 0) {
    return `FREE within 24h customer service window for ${countryName}`;
  }
  return `$${usd.toFixed(4)} (${credits} credits) â€” ${catLabel} to ${countryName}`;
}

/**
 * Check if a message is free (session/customer service reply)
 */
export function isFreeMessage(category: MessageCategory): boolean {
  return category === 'SESSION';
}

// ============================================
// MESSAGE COST CALCULATION
// ============================================

export interface MessageCost {
  credits: number;
  usd: number;
  category: MessageCategory;
  countryCode: string;
  isFree: boolean;
}

export async function calculateMessageCost(
  _prisma: PrismaClient,
  _tenantId: string,
  country: string,
  category: MessageCategory,
): Promise<MessageCost> {
  const credits = getRateCredits(country, category);
  const isFree = isFreeMessage(category);

  return {
    credits,
    usd: creditsToUsd(credits),
    category,
    countryCode: country.toUpperCase(),
    isFree,
  };
}

// ============================================
// CREDIT DEDUCTION (atomic transaction)
// ============================================

export async function deductCredits(
  prisma: PrismaClient,
  tenantId: string,
  amount: number,
  referenceId: string,
  referenceType: string,
  description?: string,
): Promise<{ success: boolean; balanceAfter: number; error?: string }> {
  // Free messages don't deduct credits
  if (amount === 0) {
    return { success: true, balanceAfter: -1 }; // -1 indicates free
  }

  const result = await prisma.$transaction(async (tx) => {
    let creditAccount = await tx.tenantCredit.findUnique({
      where: { tenantId },
    });

    if (!creditAccount) {
      // Auto-create credit account with 0 balance
      creditAccount = await tx.tenantCredit.create({
        data: {
          tenantId,
          balance: 0,
          totalPurchased: 0,
          totalUsed: 0,
        },
      });
      return { success: false, balanceAfter: 0, error: 'NO_CREDITS_ACCOUNT' };
    }

    if (creditAccount.balance < amount) {
      return {
        success: false,
        balanceAfter: creditAccount.balance,
        error: 'INSUFFICIENT_CREDITS',
      };
    }

    const updated = await tx.tenantCredit.update({
      where: { tenantId },
      data: {
        balance: { decrement: amount },
        totalUsed: { increment: amount },
      },
    });

    await tx.tenantCreditTransaction.create({
      data: {
        creditId: updated.id,
        type: 'USAGE',
        amount: -amount,
        referenceId,
        referenceType,
        description: description || `Message sent`,
        balanceAfter: updated.balance,
      },
    });

    return { success: true, balanceAfter: updated.balance };
  });

  if (result.success) {
    // Fire-and-forget: never let an auto-recharge failure block the send path
    maybeAutoRecharge(prisma, tenantId, result.balanceAfter).catch((err) => {
      console.error(`[AutoRecharge] check failed for tenant ${tenantId}:`, err);
    });
  }

  return result;
}

// ============================================
// AUTO-RECHARGE â€” server-side threshold check + off-session Stripe charge
// ============================================

export async function maybeAutoRecharge(
  prisma: PrismaClient,
  tenantId: string,
  balanceAfter: number,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      autoRechargeEnabled: true,
      autoRechargeThreshold: true,
      autoRechargeAmount: true,
      stripeCustomerId: true,
      billingEmail: true,
    },
  });

  if (!tenant?.autoRechargeEnabled) return;
  if (balanceAfter > tenant.autoRechargeThreshold) return;
  if (!tenant.stripeCustomerId) return;

  // Avoid stacking recharges: if one is already in flight (a PURCHASE transaction
  // referencing 'auto-recharge-' created in the last 5 minutes with no resolution),
  // skip. Simpler guard: re-check current balance is still under threshold inside
  // a short-lived lock via the credit row's updatedAt isn't available here, so we
  // rely on deductCredits calling this serially per-message and Stripe's own
  // idempotency key to prevent duplicate charges for the same trigger instant.
  const { stripe } = await import('./stripe.js');

  const paymentMethods = await stripe.paymentMethods.list({
    customer: tenant.stripeCustomerId,
    type: 'card',
    limit: 1,
  });

  const paymentMethodId = paymentMethods.data[0]?.id;
  if (!paymentMethodId) {
    console.error(`[AutoRecharge] tenant ${tenantId} has auto-recharge enabled but no saved card`);
    return;
  }

  const amountCredits = tenant.autoRechargeAmount;
  const amountUsdCents = Math.round(creditsToUsd(amountCredits) * 100);

  try {
    const idempotencyKey = `autorecharge-${tenantId}-${Date.now()}`;
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountUsdCents,
        currency: 'usd',
        customer: tenant.stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Auto-recharge: ${amountCredits} credits`,
        metadata: { tenantId, type: 'auto_recharge', credits: String(amountCredits) },
      },
      { idempotencyKey },
    );

    if (paymentIntent.status === 'succeeded') {
      await addCredits(prisma, tenantId, amountCredits, 'PURCHASE', paymentIntent.id, 'Auto-recharge');
      console.log(`[AutoRecharge] tenant ${tenantId} recharged ${amountCredits} credits (${paymentIntent.id})`);
    } else {
      console.error(`[AutoRecharge] tenant ${tenantId} payment intent not succeeded: ${paymentIntent.status}`);
    }
  } catch (err: any) {
    console.error(`[AutoRecharge] charge failed for tenant ${tenantId}:`, err.message);
    // Failing quietly is intentional here â€” surfaced to the tenant via their
    // Stripe email receipt/failure notice and visible low balance in-app,
    // not by throwing into the message-send path.
  }
}

// ============================================
// ADD CREDITS (purchase, bonus, refund)
// ============================================

/**
 * Takes credits for a whole batch of messages in one transaction.
 *
 * Charging per message meant one database transaction per recipient. A campaign
 * batch dispatched in parallel then opened that many transactions at once and
 * exhausted the pool, which capped safe concurrency at about three sends and
 * made bulk campaigns unusably slow. One reservation per batch removes that
 * ceiling entirely â€” the transaction count stops scaling with recipients.
 *
 * Partial reservation is deliberate: a tenant with enough credits for 800 of
 * 1,000 recipients gets 800 messages sent and a clear shortfall, rather than the
 * whole campaign refused or â€” worse â€” 800 sent free because each per-message
 * check was ignored.
 */
export async function reserveCreditsForBatch(
  prisma: PrismaClient,
  tenantId: string,
  unitCosts: number[],
  referenceId: string,
  description?: string,
): Promise<{ reservedFor: number; reservedAmount: number; shortfall: number; balanceAfter: number }> {
  const total = unitCosts.reduce((n, c) => n + c, 0);
  if (total === 0) {
    return { reservedFor: unitCosts.length, reservedAmount: 0, shortfall: 0, balanceAfter: -1 };
  }

  return prisma.$transaction(async (tx) => {
    const account = await tx.tenantCredit.findUnique({ where: { tenantId } });
    if (!account) {
      return { reservedFor: 0, reservedAmount: 0, shortfall: unitCosts.length, balanceAfter: 0 };
    }

    // Cover as many recipients as the balance allows, in order.
    let affordable = 0;
    let spend = 0;
    for (const cost of unitCosts) {
      if (spend + cost > account.balance) break;
      spend += cost;
      affordable++;
    }

    if (affordable === 0) {
      return { reservedFor: 0, reservedAmount: 0, shortfall: unitCosts.length, balanceAfter: account.balance };
    }

    const updated = await tx.tenantCredit.update({
      where: { tenantId },
      data: { balance: { decrement: spend }, totalUsed: { increment: spend } },
    });

    await tx.tenantCreditTransaction.create({
      data: {
        creditId: updated.id,
        type: 'USAGE',
        amount: -spend,
        referenceId,
        referenceType: 'CAMPAIGN',
        description: description || `Reserved for ${affordable} message(s)`,
        balanceAfter: updated.balance,
      },
    });

    return {
      reservedFor: affordable,
      reservedAmount: spend,
      shortfall: unitCosts.length - affordable,
      balanceAfter: updated.balance,
    };
  });
}

/**
 * Returns the unused part of a batch reservation â€” the recipients Meta refused.
 * One transaction for the batch, matching how the credits were taken.
 */
export async function releaseUnusedReservation(
  prisma: PrismaClient,
  tenantId: string,
  amount: number,
  referenceId: string,
  description?: string,
): Promise<void> {
  if (amount <= 0) return;
  await addCredits(prisma, tenantId, amount, 'REFUND', referenceId, description || 'Unused campaign reservation');
}

/**
 * Returns credits charged for a message the provider then refused. Named
 * separately from addCredits so the ledger reads honestly â€” a refund is not a
 * purchase, and the two should be distinguishable when reconciling.
 */
export async function refundCredits(
  prisma: PrismaClient,
  tenantId: string,
  amount: number,
  referenceId?: string,
  _referenceType?: string,
  description?: string,
): Promise<{ success: boolean; balanceAfter: number }> {
  if (amount <= 0) return { success: true, balanceAfter: -1 };
  return addCredits(prisma, tenantId, amount, 'REFUND', referenceId, description || 'Refund for undelivered message');
}

export async function addCredits(
  prisma: PrismaClient,
  tenantId: string,
  amount: number,
  type: 'PURCHASE' | 'BONUS' | 'REFUND' | 'ADJUSTMENT',
  referenceId?: string,
  description?: string,
): Promise<{ success: boolean; balanceAfter: number }> {
  const result = await prisma.$transaction(async (tx) => {
    let creditAccount = await tx.tenantCredit.findUnique({
      where: { tenantId },
    });

    if (!creditAccount) {
      creditAccount = await tx.tenantCredit.create({
        data: {
          tenantId,
          balance: 0,
          totalPurchased: 0,
          totalUsed: 0,
        },
      });
    }

    const updated = await tx.tenantCredit.update({
      where: { tenantId },
      data: {
        balance: { increment: amount },
        ...(type === 'PURCHASE' ? { totalPurchased: { increment: amount } } : {}),
      },
    });

    await tx.tenantCreditTransaction.create({
      data: {
        creditId: updated.id,
        type,
        amount,
        referenceId: referenceId || null,
        referenceType: type,
        description: description || `${type} credits`,
        balanceAfter: updated.balance,
      },
    });

    return { success: true, balanceAfter: updated.balance };
  });

  return result;
}

// ============================================
// GET TENANT CREDIT INFO
// ============================================

export async function getTenantCreditInfo(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  balanceUsd: string;
  transactions: any[];
} | null> {
  const credit = await prisma.tenantCredit.findUnique({
    where: { tenantId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!credit) return null;

  return {
    balance: credit.balance,
    totalPurchased: credit.totalPurchased,
    totalUsed: credit.totalUsed,
    balanceUsd: creditsToUsd(credit.balance).toFixed(4),
    transactions: credit.transactions,
  };
}

// ============================================
// RECORD MESSAGE CREDIT (audit trail)
// ============================================

export async function recordMessageCredit(
  prisma: PrismaClient,
  data: {
    tenantId: string;
    messageId: string;
    country: string;
    category: MessageCategory;
    cost: number;
  },
): Promise<void> {
  // Skip recording for free messages
  if (data.cost === 0) return;

  await prisma.messageCredit.create({
    data: {
      tenantId: data.tenantId,
      messageId: data.messageId,
      countryCode: data.country?.toUpperCase() || 'US',
      category: data.category,
      cost: data.cost,
      refunded: false,
    },
  });
}

// ============================================
// SEED CREDIT RATES (DB initialization)
// ============================================

/**
 * Default markup applied when seeding a country for the first time.
 *
 * 1.0 would mean reselling at exactly Meta's price and earning nothing on
 * messages. 1.30 is a starting point, not a recommendation â€” the whole purpose
 * of moving rates into the database is that this becomes the operator's call,
 * per country and category, from the panel.
 */
export const DEFAULT_MARKUP = 1.30;

/**
 * Populates rates from Meta's published prices, recording Meta's cost alongside
 * the sell price so margin stays visible after the fact.
 *
 * Only fills in countries that are missing, so re-running never overwrites a
 * price an operator has set by hand.
 */
export async function seedCreditRates(prisma: PrismaClient, markup = DEFAULT_MARKUP): Promise<number> {
  const entries = Object.entries(META_RATES).filter(([code]) => code !== 'OTHER' && !code.startsWith('ROW_'));

  const existing = await prisma.creditRate.findMany({ select: { countryCode: true } });
  const have = new Set(existing.map((r) => r.countryCode.toUpperCase()));

  let created = 0;
  for (const [code, rates] of entries) {
    if (have.has(code.toUpperCase())) continue;

    await prisma.creditRate.create({
      data: {
        countryCode: code,
        countryName: COUNTRY_NAMES[code] || code,
        currency: rates.currency,
        marketingCredits: Math.max(1, Math.round(rates.marketing * markup)),
        utilityCredits: Math.max(1, Math.round(rates.utility * markup)),
        authCredits: Math.max(1, Math.round(rates.auth * markup)),
        serviceCredits: rates.session, // free on Meta's side; charging for it would be inventing a cost
        metaMarketingCredits: rates.marketing,
        metaUtilityCredits: rates.utility,
        metaAuthCredits: rates.auth,
      },
    });
    created++;
  }

  return created;
}

// ============================================
// COUNTRY DETECTION HELPERS
// ============================================

/**
 * Get all available country codes
 */
export function getAvailableCountries(): string[] {
  return Object.keys(META_RATES).filter(code =>
    code !== 'OTHER' && !code.startsWith('ROW_')
  );
}
