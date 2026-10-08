/**
 * Knowledge Base — RAG (retrieval-augmented generation) support for the
 * `ai_reply` chatbot flow step.
 *
 * Embeddings and generation both go through aiProvider.ts, so this follows
 * whichever provider the panel selects. Every call is wrapped so an
 * unconfigured or failing provider returns null instead of throwing, and
 * callers fall back to a static message rather than the bot going silent.
 */
import { PrismaClient } from '@prisma/client';
export declare function chunkText(text: string): string[];
export declare function embedText(prisma: PrismaClient, text: string): Promise<number[] | null>;
export declare function embedBatch(prisma: PrismaClient, texts: string[]): Promise<(number[] | null)[]>;
export declare function cosineSimilarity(a: number[], b: number[]): number;
export interface RetrievedChunk {
    id: string;
    content: string;
    documentId: string;
    similarity: number;
}
export declare function retrieveRelevantChunks(prisma: PrismaClient, tenantId: string, knowledgeBaseId: string, queryEmbedding: number[], topK?: number): Promise<RetrievedChunk[]>;
/**
 * How many chunks were embedded by a model other than the current one, and so
 * are invisible to search until re-indexed.
 */
export declare function countStaleChunks(prisma: PrismaClient, tenantId?: string, knowledgeBaseId?: string): Promise<{
    total: number;
    stale: number;
    expectedDimensions: number;
}>;
export interface GenerateRagReplyParams {
    prisma: PrismaClient;
    tenantId: string;
    knowledgeBaseId: string;
    systemPrompt: string;
    userMessage: string;
    /**
     * Scope and refusal rules. Optional so a caller without them still works,
     * but the chatbot path always supplies them — grounding a reply in retrieved
     * documents stops it inventing facts, and does nothing at all to stop it
     * answering a question that has no business being asked.
     */
    guardrails?: import('./aiGuardrails.js').GuardrailConfig;
}
export interface RagReplyResult {
    reply: string;
    chunks: RetrievedChunk[];
}
/**
 * Full RAG pipeline: embed the query, retrieve relevant chunks, generate a
 * grounded reply. Returns null on any failure (no provider configured,
 * embedding failure, no relevant chunks, or generation failure) — never throws.
 */
export declare function generateRagReply(params: GenerateRagReplyParams): Promise<RagReplyResult | null>;
//# sourceMappingURL=knowledgeBase.d.ts.map