/**
 * Avatar upload and file serving.
 *
 * Two things were broken here. The Change Photo button had no click handler at
 * all, so nothing was ever uploaded; and User.avatarUrl existed as a column
 * that nothing wrote. Files also lived only on the server's disk, so anything
 * meant to persist would not survive a move to a fresh box.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { getR2Config, putObject, getObject, deleteObject, saveR2Config, testR2 } from '../services/objectStorage.js';

const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function registerFileRoutes(app: FastifyInstance) {
  /**
   * POST /uploads/avatar
   * Replaces the caller's own profile picture. No id is accepted — a route that
   * took one would let anyone change anyone's photo.
   */
  app.post('/uploads/avatar', async (request, reply) => {
    if (!request.authUser?.id) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const file = await (request as any).file();
    if (!file) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'No image was uploaded.' } });
    }

    const ext = AVATAR_TYPES[file.mimetype];
    if (!ext) {
      return reply.status(415).send({
        success: false,
        error: { code: 'UNSUPPORTED_TYPE', message: 'Use a JPG, PNG or WebP image.' },
      });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > MAX_AVATAR_BYTES) {
      return reply.status(413).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'Images must be 5MB or smaller.' },
      });
    }

    const cfg = await getR2Config(app.prisma);
    if (!cfg) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'STORAGE_NOT_CONFIGURED',
          message: 'File storage is not set up yet. Add Cloudflare R2 credentials in Superadmin → System.',
        },
      });
    }

    // The uuid means a new photo is a new key, so a cached old one can never be
    // served in its place.
    const key = `avatars/${request.authUser.id}/${crypto.randomUUID()}${ext}`;

    let stored;
    try {
      stored = await putObject(cfg, key, buffer, file.mimetype);
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: err.message },
      });
    }

    const previous = await app.prisma.user.findUnique({
      where: { id: request.authUser.id },
      select: { avatarUrl: true },
    });

    await app.prisma.user.update({
      where: { id: request.authUser.id },
      data: { avatarUrl: stored.url },
    });

    // Remove the old object so a profile photo changed ten times does not leave
    // ten files behind. Best effort: failing to tidy up must not fail the
    // upload that already succeeded.
    const oldKey = previous?.avatarUrl?.match(/avatars\/[^?]+/)?.[0];
    if (oldKey && oldKey !== key) {
      deleteObject(cfg, oldKey).catch(() => {});
    }

    return { success: true, data: { url: stored.url, key: stored.key, size: stored.size } };
  });

  /**
   * GET /files/*
   *
   * Serves an object from R2 when the bucket has no public URL. A public bucket
   * or custom domain is faster and cheaper; this exists so uploads work before
   * that is set up rather than appearing to work and showing broken images.
   */
  app.get('/files/*', async (request, reply) => {
    const key = (request.params as any)['*'] as string;
    if (!key || key.includes('..')) {
      return reply.status(400).send({ success: false, error: { code: 'BAD_KEY' } });
    }

    const cfg = await getR2Config(app.prisma);
    if (!cfg) return reply.status(503).send({ success: false, error: { code: 'STORAGE_NOT_CONFIGURED' } });

    try {
      const obj = await getObject(cfg, key);
      if (!obj) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
      return reply
        .header('Content-Type', obj.contentType)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(obj.body);
    } catch (err: any) {
      return reply.status(502).send({ success: false, error: { code: 'READ_FAILED', message: err.message } });
    }
  });
}

/** Storage configuration, superadmin only. */
export async function registerStorageAdminRoutes(app: FastifyInstance) {
  app.get('/storage', async () => {
    const cfg = await getR2Config(app.prisma);
    return {
      success: true,
      data: cfg
        ? {
            configured: true,
            endpoint: cfg.endpoint,
            bucket: cfg.bucket,
            publicBaseUrl: cfg.publicBaseUrl,
            // Secrets are never returned, only whether they are set.
            hasAccessKeyId: !!cfg.accessKeyId,
            hasSecretAccessKey: !!cfg.secretAccessKey,
            serving: cfg.publicBaseUrl ? 'direct from R2' : 'proxied through this API',
          }
        : { configured: false },
    };
  });

  app.put('/storage', async (request, reply) => {
    const body = z.object({
      endpoint: z.string().url().optional(),
      bucket: z.string().min(1).max(64).optional(),
      accessKeyId: z.string().max(200).optional(),
      secretAccessKey: z.string().max(300).optional(),
      publicBaseUrl: z.string().max(300).optional(),
    }).parse(request.body);

    await saveR2Config(app.prisma, body as any);
    const cfg = await getR2Config(app.prisma);

    return reply.send({
      success: true,
      data: { configured: !!cfg, serving: cfg?.publicBaseUrl ? 'direct from R2' : 'proxied through this API' },
    });
  });

  /** Round-trips a real object, so a wrong key is caught now rather than on first use. */
  app.post('/storage/test', async (_request, reply) => {
    const cfg = await getR2Config(app.prisma);
    if (!cfg) {
      return reply.send({ success: true, data: { ok: false, detail: 'Storage is not configured yet.' } });
    }
    return reply.send({ success: true, data: await testR2(cfg) });
  });
}
