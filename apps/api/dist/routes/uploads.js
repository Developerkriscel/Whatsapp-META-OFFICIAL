import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { mkdir, unlink, stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import path from 'path';
/**
 * Campaign header media that the tenant uploads from their own machine, rather
 * than hosting somewhere and pasting a URL. Meta fetches the media over HTTP at
 * send time, so the file has to be publicly reachable for the duration of the
 * campaign — it is deleted once the campaign finishes sending.
 */
// Meta's documented caps for template header media, per type.
const ALLOWED = {
    'image/jpeg': { kind: 'image', maxBytes: 5 * 1024 * 1024 },
    'image/png': { kind: 'image', maxBytes: 5 * 1024 * 1024 },
    'video/mp4': { kind: 'video', maxBytes: 16 * 1024 * 1024 },
    'video/3gpp': { kind: 'video', maxBytes: 16 * 1024 * 1024 },
    'application/pdf': { kind: 'document', maxBytes: 100 * 1024 * 1024 },
};
const EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'application/pdf': '.pdf',
};
export function uploadsRoot() {
    return process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
}
export function campaignMediaDir() {
    return path.join(uploadsRoot(), 'campaign-media');
}
/**
 * Deletes a previously uploaded campaign media file. Refuses any path that
 * escapes the campaign-media directory, so a tampered mediaPath in the database
 * can never be used to unlink arbitrary files. Missing files are not an error —
 * cleanup runs on a best-effort basis and may legitimately run twice.
 */
export async function deleteCampaignMedia(mediaPath) {
    if (!mediaPath)
        return false;
    const dir = campaignMediaDir();
    const resolved = path.resolve(dir, path.basename(mediaPath));
    if (path.dirname(resolved) !== path.resolve(dir))
        return false;
    try {
        await unlink(resolved);
        return true;
    }
    catch (err) {
        if (err?.code !== 'ENOENT') {
            console.error(`[uploads] failed to delete ${resolved}:`, err?.message);
        }
        return false;
    }
}
export async function registerUploadRoutes(app) {
    /**
     * POST /uploads/campaign-media
     * Accepts a single multipart file and returns the URL to hand to Meta.
     */
    app.post('/uploads/campaign-media', { preHandler: [app.requirePermission('campaigns', 'create')] }, async (request, reply) => {
        const file = await request.file();
        if (!file) {
            return reply.status(400).send({
                success: false,
                error: { code: 'NO_FILE', message: 'No file was uploaded' },
            });
        }
        const rule = ALLOWED[file.mimetype];
        if (!rule) {
            return reply.status(415).send({
                success: false,
                error: {
                    code: 'UNSUPPORTED_TYPE',
                    message: `Unsupported file type "${file.mimetype}". Allowed: JPG, PNG, MP4, 3GP, PDF.`,
                },
            });
        }
        const dir = campaignMediaDir();
        await mkdir(dir, { recursive: true });
        const filename = `${randomUUID()}${EXT[file.mimetype]}`;
        const dest = path.join(dir, filename);
        try {
            await pipeline(file.file, createWriteStream(dest));
        }
        catch (err) {
            await unlink(dest).catch(() => { });
            return reply.status(500).send({
                success: false,
                error: { code: 'WRITE_FAILED', message: 'Could not save the uploaded file' },
            });
        }
        // @fastify/multipart truncates past its configured limit rather than
        // throwing, so the flag has to be checked after the stream drains.
        if (file.file.truncated) {
            await unlink(dest).catch(() => { });
            return reply.status(413).send({
                success: false,
                error: {
                    code: 'FILE_TOO_LARGE',
                    message: `File exceeds the ${Math.round(rule.maxBytes / 1024 / 1024)}MB limit for ${rule.kind} media`,
                },
            });
        }
        const { size } = await stat(dest);
        if (size > rule.maxBytes) {
            await unlink(dest).catch(() => { });
            return reply.status(413).send({
                success: false,
                error: {
                    code: 'FILE_TOO_LARGE',
                    message: `File exceeds the ${Math.round(rule.maxBytes / 1024 / 1024)}MB limit for ${rule.kind} media`,
                },
            });
        }
        // Meta fetches this URL from its own servers, so it must be absolute and
        // publicly resolvable — a relative path or localhost would fail at send time.
        const base = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
        const url = `${base}/uploads/campaign-media/${filename}`;
        return reply.status(201).send({
            success: true,
            data: {
                url,
                path: filename,
                kind: rule.kind,
                mimetype: file.mimetype,
                size,
                originalName: file.filename,
            },
        });
    });
    /**
     * DELETE /uploads/campaign-media/:filename
     * Lets the editor discard a file the user uploaded and then removed before
     * ever saving the campaign, instead of orphaning it on disk.
     */
    app.delete('/uploads/campaign-media/:filename', { preHandler: [app.requirePermission('campaigns', 'create')] }, async (request, reply) => {
        const { filename } = request.params;
        const deleted = await deleteCampaignMedia(filename);
        return reply.send({ success: true, data: { deleted } });
    });
}
//# sourceMappingURL=uploads.js.map