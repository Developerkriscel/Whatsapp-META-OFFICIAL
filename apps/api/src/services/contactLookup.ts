/**
 * Finding the contact a phone number belongs to, whatever shape it was stored in.
 *
 * Meta sends the sender as bare international digits: 919074271866. Contacts
 * are stored however they arrived -- '+919074271866' from a CSV, '9074271866'
 * typed by hand, '919074271866' from a campaign import. The inbound webhook
 * matched on the raw string, so a reply from someone already in the contact
 * list frequently matched nothing, and a second contact was created. A second
 * contact means a second conversation, which is why replies from one number
 * kept appearing in a different thread from the history.
 *
 * Matching is on digits, and on the last ten of them. A national number and the
 * same number with its country code are the same person, and ten digits is long
 * enough that a collision inside one tenant's contact list is not a practical
 * concern.
 */
import type { PrismaClient } from '@prisma/client';

/** Digits only. */
export function digitsOf(phone: string | null | undefined): string {
  return (phone || '').replace(/\D/g, '');
}

/**
 * The comparable part of a number: its last ten digits, or all of them when
 * shorter. '+919074271866', '919074271866' and '9074271866' all reduce to
 * '9074271866'.
 */
export function phoneKey(phone: string | null | undefined): string {
  const d = digitsOf(phone);
  return d.length > 10 ? d.slice(-10) : d;
}

/**
 * The contact this number belongs to, or null.
 *
 * Tries the exact string first because that is indexed and covers the common
 * case; only falls back to the digit comparison when it misses. The fallback is
 * scoped to the tenant, so it never reads another tenant's contacts even though
 * it cannot use the index.
 */
export async function findContactByPhone(
  prisma: PrismaClient,
  tenantId: string,
  phone: string,
): Promise<{ id: string; phone: string; name: string | null } | null> {
  const exact = await prisma.contact.findFirst({
    where: { tenantId, phone },
    select: { id: true, phone: true, name: true },
  });
  if (exact) return exact;

  const key = phoneKey(phone);
  if (key.length < 7) return null;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; phone: string; name: string | null }>>(
    `SELECT id, phone, name FROM contacts
      WHERE "tenantId" = $1
        AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $2
      ORDER BY "createdAt" ASC
      LIMIT 1`,
    tenantId,
    key,
  );
  return rows[0] ?? null;
}
