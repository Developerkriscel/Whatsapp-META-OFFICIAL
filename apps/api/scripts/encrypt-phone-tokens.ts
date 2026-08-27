/**
 * One-time backfill: encrypts PhoneNumber.accessToken values that were written
 * before per-phone tokens were encrypted at rest.
 *
 * Safe to run more than once — rows already carrying the "enc:" prefix are
 * skipped, so a partial run can simply be repeated.
 *
 * Run from apps/api with the env file loaded, e.g.
 *   node --env-file=.env <tsx-cli> scripts/encrypt-phone-tokens.ts
 * Pass --apply to write; without it the script only reports what it would do.
 */
import { PrismaClient } from '@prisma/client';
import { encryptSecret, decryptSecret } from '../src/services/credentialEncryption.js';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
    console.error('CREDENTIALS_ENCRYPTION_KEY is not set — refusing to run.');
    process.exit(1);
  }

  const phones = await prisma.phoneNumber.findMany({
    where: { accessToken: { not: null } },
    select: { id: true, phoneNumber: true, accessToken: true },
  });

  const plaintext = phones.filter((p) => !p.accessToken!.startsWith('enc:'));

  console.log(`phone rows with a token : ${phones.length}`);
  console.log(`already encrypted       : ${phones.length - plaintext.length}`);
  console.log(`to encrypt              : ${plaintext.length}`);

  if (plaintext.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  console.log('');
  for (const p of plaintext) {
    console.log(`  ${p.phoneNumber}  (${p.accessToken!.slice(0, 8)}…, ${p.accessToken!.length} chars)`);
  }

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to write these changes.');
    return;
  }

  let done = 0;
  for (const p of plaintext) {
    const ciphertext = encryptSecret(p.accessToken!);

    // Verify the round trip before persisting: a token that can't be read back
    // would silently break every Meta call for this phone number.
    if (decryptSecret(ciphertext) !== p.accessToken) {
      console.error(`\nRound-trip check FAILED for ${p.phoneNumber} — aborting, no further rows written.`);
      process.exit(1);
    }

    await prisma.phoneNumber.update({ where: { id: p.id }, data: { accessToken: ciphertext } });
    done++;
  }

  console.log(`\nEncrypted ${done} token(s).`);

  const left = await prisma.phoneNumber.findMany({
    where: { accessToken: { not: null } },
    select: { accessToken: true },
  });
  const stillPlain = left.filter((p) => !p.accessToken!.startsWith('enc:')).length;
  console.log(`Remaining plaintext tokens: ${stillPlain}`);
}

main()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
