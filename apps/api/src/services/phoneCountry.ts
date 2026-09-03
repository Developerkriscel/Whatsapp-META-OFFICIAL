/**
 * Country detection from a phone number.
 *
 * This matters for billing, not display: a contact's country selects the
 * per-message rate. Getting it wrong changes what the tenant is charged — an
 * Indian number billed as US costs 325 credits for a marketing message instead
 * of 153.
 *
 * Before this existed, each place that created a contact decided for itself:
 * CSV import hardcoded 'US', two other paths hardcoded 'IN', the inbound webhook
 * set nothing and inherited the schema default, and the billing lookup fell back
 * to 'US' while the schema defaulted to 'IN'. Same contact, different answer
 * depending on how it arrived.
 */

/**
 * Dial code to ISO country, longest prefix first so +1 does not shadow +1868.
 *
 * Codes that cover several countries resolve to the one whose rate applies —
 * +1 is US and Canada, which Meta prices identically, so either is correct for
 * billing. This is a billing lookup, not a geography lookup.
 */
const DIAL_CODES: Array<[string, string]> = [
  // Longer, more specific codes first
  ['1868', 'TT'], ['1876', 'JM'], ['1809', 'DO'],
  ['998', 'UZ'], ['996', 'KG'], ['995', 'GE'], ['994', 'AZ'], ['993', 'TM'],
  ['992', 'TJ'], ['977', 'NP'], ['976', 'MN'], ['975', 'BT'], ['974', 'QA'],
  ['973', 'BH'], ['972', 'IL'], ['971', 'AE'], ['970', 'PS'], ['968', 'OM'],
  ['967', 'YE'], ['966', 'SA'], ['965', 'KW'], ['964', 'IQ'], ['963', 'SY'],
  ['962', 'JO'], ['961', 'LB'], ['960', 'MV'], ['886', 'TW'], ['880', 'BD'],
  ['856', 'LA'], ['855', 'KH'], ['852', 'HK'], ['853', 'MO'],
  ['506', 'CR'], ['507', 'PA'], ['503', 'SV'], ['502', 'GT'], ['504', 'HN'],
  ['505', 'NI'], ['501', 'BZ'], ['509', 'HT'],
  ['595', 'PY'], ['598', 'UY'], ['593', 'EC'], ['591', 'BO'], ['597', 'SR'],
  ['380', 'UA'], ['375', 'BY'], ['373', 'MD'], ['372', 'EE'], ['371', 'LV'],
  ['370', 'LT'], ['359', 'BG'], ['358', 'FI'], ['357', 'CY'], ['356', 'MT'],
  ['355', 'AL'], ['354', 'IS'], ['353', 'IE'], ['352', 'LU'], ['351', 'PT'],
  ['350', 'GI'], ['386', 'SI'], ['385', 'HR'], ['387', 'BA'], ['389', 'MK'],
  ['381', 'RS'], ['382', 'ME'], ['383', 'XK'],
  ['268', 'SZ'], ['267', 'BW'], ['266', 'LS'], ['265', 'MW'], ['264', 'NA'],
  ['263', 'ZW'], ['262', 'RE'], ['261', 'MG'], ['260', 'ZM'], ['258', 'MZ'],
  ['257', 'BI'], ['256', 'UG'], ['255', 'TZ'], ['254', 'KE'], ['253', 'DJ'],
  ['252', 'SO'], ['251', 'ET'], ['250', 'RW'], ['249', 'SD'], ['248', 'SC'],
  ['244', 'AO'], ['243', 'CD'], ['242', 'CG'], ['241', 'GA'], ['240', 'GQ'],
  ['239', 'ST'], ['238', 'CV'], ['237', 'CM'], ['236', 'CF'], ['235', 'TD'],
  ['234', 'NG'], ['233', 'GH'], ['232', 'SL'], ['231', 'LR'], ['230', 'MU'],
  ['229', 'BJ'], ['228', 'TG'], ['227', 'NE'], ['226', 'BF'], ['225', 'CI'],
  ['224', 'GN'], ['223', 'ML'], ['222', 'MR'], ['221', 'SN'], ['220', 'GM'],
  ['218', 'LY'], ['216', 'TN'], ['213', 'DZ'], ['212', 'MA'],
  ['673', 'BN'], ['679', 'FJ'], ['675', 'PG'],
  // Two digit
  ['93', 'AF'], ['92', 'PK'], ['91', 'IN'], ['90', 'TR'], ['86', 'CN'],
  ['84', 'VN'], ['82', 'KR'], ['81', 'JP'], ['66', 'TH'], ['65', 'SG'],
  ['64', 'NZ'], ['63', 'PH'], ['62', 'ID'], ['61', 'AU'], ['60', 'MY'],
  ['58', 'VE'], ['57', 'CO'], ['56', 'CL'], ['55', 'BR'], ['54', 'AR'],
  ['53', 'CU'], ['52', 'MX'], ['51', 'PE'], ['49', 'DE'], ['48', 'PL'],
  ['47', 'NO'], ['46', 'SE'], ['45', 'DK'], ['44', 'GB'], ['43', 'AT'],
  ['41', 'CH'], ['40', 'RO'], ['39', 'IT'], ['36', 'HU'], ['34', 'ES'],
  ['33', 'FR'], ['32', 'BE'], ['31', 'NL'], ['30', 'GR'], ['27', 'ZA'],
  ['20', 'EG'],
  // Single digit last, so they never shadow anything above
  ['7', 'RU'], ['1', 'US'],
];

// Sorted once at module load rather than on every lookup.
const SORTED = [...DIAL_CODES].sort((a, b) => b[0].length - a[0].length);

/**
 * Best-effort ISO country for a phone number.
 *
 * Returns `fallback` when the number carries no recognisable dial code — a
 * local-format number with no country prefix, for instance. Callers should pass
 * the tenant's own default there, since a tenant's contacts are usually from
 * their own market.
 */
export function detectCountryFromPhone(phone: string | null | undefined, fallback = 'IN'): string {
  if (!phone) return fallback;

  const digits = phone.replace(/[^\d]/g, '');
  // Too short to carry a country code and a subscriber number.
  if (digits.length < 8) return fallback;

  for (const [code, iso] of SORTED) {
    if (digits.startsWith(code)) return iso;
  }
  return fallback;
}

/** True when the number begins with a dial code we recognise. */
export function hasKnownDialCode(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 8) return false;
  return SORTED.some(([code]) => digits.startsWith(code));
}
