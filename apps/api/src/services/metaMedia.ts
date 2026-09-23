/**
 * Hand the image to Meta, instead of asking Meta to come and fetch it.
 *
 * A template with a media header can be sent two ways: a `link` Meta downloads
 * from us, or an `id` for a file already uploaded to Meta. We used the link,
 * and that has two problems.
 *
 * The one that broke a campaign: "sent" does not mean Meta has the image. Meta
 * accepts the message, returns a wamid, and fetches the URL some seconds later.
 * Campaign cleanup deleted the file the moment the last message was accepted,
 * so every fetch landed on a 404 and all 25 recipients failed with 131053 —
 * eight seconds after the campaign reported Completed.
 *
 * The quieter one: a link is fetched once per recipient. A 250-person campaign
 * meant 250 downloads of the same file from our server, in a burst, from Meta's
 * infrastructure — and any blip in that window fails those recipients.
 *
 * Uploading once and sending the id fixes both, and removes the requirement
 * that our media URL be publicly reachable at all.
 */
import fs from 'fs';
import path from 'path';

const GRAPH = 'https://graph.facebook.com/v18.0';

/** Meta keeps an uploaded media id for 30 days; we refresh well inside that. */
export const MEDIA_ID_TTL_DAYS = 25;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  mp4: 'video/mp4', '3gp': 'video/3gpp',
  pdf: 'application/pdf',
};

export function mimeForPath(filePath: string): string | null {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return MIME_BY_EXT[ext] || null;
}

/** 'image' | 'video' | 'document', as the template header component names it. */
export function kindForMime(mime: string): 'image' | 'video' | 'document' {
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'document';
  return 'image';
}

export interface UploadedMedia {
  id: string;
  kind: 'image' | 'video' | 'document';
}

/**
 * Uploads a local file to Meta and returns the media id.
 *
 * Returns null rather than throwing: the caller falls back to sending a link,
 * which is what the product did before and still works when the file is
 * reachable. An upload failure should degrade the send, not cancel it.
 */
export async function uploadToMeta(params: {
  filePath: string;
  metaPhoneId: string;
  accessToken: string;
}): Promise<UploadedMedia | null> {
  const { filePath, metaPhoneId, accessToken } = params;

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`[MetaMedia] file missing, cannot upload: ${filePath}`);
      return null;
    }
    const mime = mimeForPath(filePath);
    if (!mime) {
      console.error(`[MetaMedia] unsupported file type: ${filePath}`);
      return null;
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append(
      'file',
      new Blob([fs.readFileSync(filePath)], { type: mime }),
      path.basename(filePath),
    );

    const res = await fetch(`${GRAPH}/${metaPhoneId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.id) {
      console.error(
        `[MetaMedia] upload failed HTTP ${res.status}: ${String(json?.error?.message || res.statusText).slice(0, 200)}`,
      );
      return null;
    }

    return { id: String(json.id), kind: kindForMime(mime) };
  } catch (err: any) {
    console.error(`[MetaMedia] upload failed: ${err?.message}`);
    return null;
  }
}

/** The header component parameter, built around an uploaded id. */
export function mediaHeaderFromId(media: UploadedMedia): any {
  return { type: media.kind, [media.kind]: { id: media.id } };
}
