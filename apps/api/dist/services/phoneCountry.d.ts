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
 * Best-effort ISO country for a phone number.
 *
 * Returns `fallback` when the number carries no recognisable dial code — a
 * local-format number with no country prefix, for instance. Callers should pass
 * the tenant's own default there, since a tenant's contacts are usually from
 * their own market.
 */
export declare function detectCountryFromPhone(phone: string | null | undefined, fallback?: string): string;
/** True when the number begins with a dial code we recognise. */
export declare function hasKnownDialCode(phone: string | null | undefined): boolean;
//# sourceMappingURL=phoneCountry.d.ts.map