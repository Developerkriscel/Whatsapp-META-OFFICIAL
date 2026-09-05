/**
 * Object storage on Cloudflare R2.
 *
 * Uploads currently land on the server's own disk, which is fine for a template
 * sample Meta fetches once and forgets, and wrong for anything meant to persist:
 * a redeploy to a fresh box loses it, and nothing is backed up.
 *
 * R2 speaks S3, so this signs requests with SigV4 directly rather than pulling
 * in the AWS SDK — the whole surface used here is PUT, DELETE and GET, and
 * adding a large dependency to a running app to make three calls is a poor
 * trade. Signing is about seventy lines and has no moving parts.
 *
 * Credentials live in platform_settings, encrypted with the same helper the
 * WhatsApp tokens use, so no key is ever committed or pasted into a chat.
 */
import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { encryptSecret, decryptIfPresent } from './credentialEncryption.js';

export interface R2Config {
  endpoint: string;      // https://<account>.r2.cloudflarestorage.com
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** A public bucket or custom domain. Without one, files are served through us. */
  publicBaseUrl?: string | null;
}

const SETTING_KEYS = {
  endpoint: 'r2_endpoint',
  bucket: 'r2_bucket',
  accessKeyId: 'r2_access_key_id',
  secretAccessKey: 'r2_secret_access_key',
  publicBaseUrl: 'r2_public_base_url',
};

export async function getR2Config(prisma: PrismaClient): Promise<R2Config | null> {
  try {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: Object.values(SETTING_KEYS) } },
    });
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? '';

    const endpoint = get(SETTING_KEYS.endpoint);
    const bucket = get(SETTING_KEYS.bucket);
    const accessKeyId = decryptIfPresent(get(SETTING_KEYS.accessKeyId)) || '';
    const secretAccessKey = decryptIfPresent(get(SETTING_KEYS.secretAccessKey)) || '';

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

    return {
      endpoint: endpoint.replace(/\/+$/, ''),
      bucket,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl: get(SETTING_KEYS.publicBaseUrl)?.replace(/\/+$/, '') || null,
    };
  } catch {
    return null;
  }
}

export async function saveR2Config(
  prisma: PrismaClient,
  cfg: Partial<Record<keyof R2Config, string>>
): Promise<void> {
  const writes: any[] = [];
  const put = (key: string, value: string) =>
    writes.push(prisma.platformSetting.upsert({
      where: { key }, create: { key, value }, update: { value },
    }));

  if (cfg.endpoint !== undefined) put(SETTING_KEYS.endpoint, cfg.endpoint.replace(/\/+$/, ''));
  if (cfg.bucket !== undefined) put(SETTING_KEYS.bucket, cfg.bucket);
  if (cfg.publicBaseUrl !== undefined) put(SETTING_KEYS.publicBaseUrl, cfg.publicBaseUrl);
  // Secrets are encrypted before they touch the database.
  if (cfg.accessKeyId) put(SETTING_KEYS.accessKeyId, encryptSecret(cfg.accessKeyId));
  if (cfg.secretAccessKey) put(SETTING_KEYS.secretAccessKey, encryptSecret(cfg.secretAccessKey));

  if (writes.length) await prisma.$transaction(writes);
}

// ── SigV4 ────────────────────────────────────────────────────────

const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => crypto.createHmac('sha256', key).update(data).digest();

/**
 * Signs one request for R2. Region is always "auto" — R2 accepts no other, and
 * the signature is rejected outright if it disagrees.
 */
function sign(
  cfg: R2Config,
  method: string,
  key: string,
  payload: Buffer | string,
  extraHeaders: Record<string, string> = {}
): { url: string; headers: Record<string, string> } {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(payload);

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };

  const signedHeaderNames = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderNames
    .map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)!]).trim()}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  // Each path segment is encoded separately: a slash in the key is a real
  // separator, and encoding it would change the object's name.
  const canonicalUri = url.pathname.split('/').map((s) => encodeURIComponent(s)).join('/');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), 'auto'), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: url.toString(), headers };
}

export interface StoredObject {
  key: string;
  url: string;
  /** True when the URL points at R2 directly rather than back through us. */
  publicDirect: boolean;
  size: number;
}

export async function putObject(
  cfg: R2Config,
  key: string,
  body: Buffer,
  contentType: string
): Promise<StoredObject> {
  const { url, headers } = sign(cfg, 'PUT', key, body, {
    'content-type': contentType,
    // A year: the key carries a uuid, so a changed file is a different key and
    // a stale cache entry cannot serve the wrong image.
    'cache-control': 'public, max-age=31536000, immutable',
  });

  const res = await fetch(url, { method: 'PUT', headers, body: body as any });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 rejected the upload (${res.status}): ${text.slice(0, 200)}`);
  }

  return {
    key,
    url: cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/${key}` : `/api/v1/files/${key}`,
    publicDirect: !!cfg.publicBaseUrl,
    size: body.length,
  };
}

export async function getObject(cfg: R2Config, key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const { url, headers } = sign(cfg, 'GET', key, '');
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 read failed (${res.status})`);
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function deleteObject(cfg: R2Config, key: string): Promise<boolean> {
  const { url, headers } = sign(cfg, 'DELETE', key, '');
  const res = await fetch(url, { method: 'DELETE', headers });
  return res.ok || res.status === 404;
}

/** Round-trips a small object so a misconfiguration is caught at setup, not at first use. */
export async function testR2(cfg: R2Config): Promise<{ ok: boolean; detail: string }> {
  const key = `_healthcheck/${crypto.randomUUID()}.txt`;
  const payload = Buffer.from(`kriscel-wa storage check ${new Date().toISOString()}`);
  try {
    await putObject(cfg, key, payload, 'text/plain');
    const read = await getObject(cfg, key);
    if (!read || read.body.toString() !== payload.toString()) {
      return { ok: false, detail: 'Wrote the object but could not read it back.' };
    }
    await deleteObject(cfg, key);
    return { ok: true, detail: 'Wrote, read and deleted a test object successfully.' };
  } catch (err: any) {
    return { ok: false, detail: err.message };
  }
}
