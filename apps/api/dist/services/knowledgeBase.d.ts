/**
 * Knowledge Base — RAG (retrieval-augmented generation) support for the
 * `ai_reply` chatbot flow step. Same Mistral integration pattern as
 * aiAssist.ts: every call is wrapped so a missing MISTRAL_API_KEY or a
 * network/API failure returns null instead of throwing, so callers can
 * always fall back to a static message rather than the bot going silent.
 */
import { PrismaClient } from '@prisma/client';
export declare function chunkText(text: string): string[];
export declare function embedText(text: string): Promise<number[] | null>;
export declare function embedBatch(texts: string[]): Promise<(number[] | null)[]>;
export declare function cosineSimilarity(a: number[], b: number[]): number;
export interface RetrievedChunk {
    id: string;
    content: string;
    documentId: string;
    similarity: number;
}
export declare function retrieveRelevantChunks(prisma: PrismaClient, tenantId: string, knowledgeBaseId: string, queryEmbedding: number[], topK?: number): Promise<RetrievedChunk[]>;
export interface GenerateRagReplyParams {
    prisma: PrismaClient;
    tenantId: string;
    knowledgeBaseId: string;
    systemPrompt: string;
    userMessage: string;
}
export interface RagReplyResult {
    reply: string;
    chunks: RetrievedChunk[];
}
/**
 * Full RAG pipeline: embed the query, retrieve relevant chunks, generate a
 * grounded reply. Returns null on any failure (no API key, embedding
 * failure, no relevant chunks, or generation failure) — never throws.
 */
export declare function generateRagReply(params: GenerateRagReplyParams): Promise<RagReplyResult | null>;
//# sourceMappingURL=knowledgeBase.d.ts.map