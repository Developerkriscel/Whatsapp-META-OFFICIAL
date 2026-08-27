import { FastifyInstance } from 'fastify';
export declare function uploadsRoot(): string;
export declare function campaignMediaDir(): string;
/**
 * Deletes a previously uploaded campaign media file. Refuses any path that
 * escapes the campaign-media directory, so a tampered mediaPath in the database
 * can never be used to unlink arbitrary files. Missing files are not an error —
 * cleanup runs on a best-effort basis and may legitimately run twice.
 */
export declare function deleteCampaignMedia(mediaPath: string | null | undefined): Promise<boolean>;
export declare function registerUploadRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=uploads.d.ts.map