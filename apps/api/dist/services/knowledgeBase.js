/**
 * Knowledge Base — RAG (retrieval-augmented generation) support for the
 * `ai_reply` chatbot flow step.
 *
 * Embeddings and generation both go through aiProvider.ts, so this follows
 * whichever provider the panel selects. Every call is wrapped so an
 * unconfigured or failing provider returns null instead of throwing, and
 * callers fall back to a static message rather than the bot going silent.
 */
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const MIN_SIMILARITY = 0.5;
export function chunkText(text) {
    const paragraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
    const chunks = [];
    for (const paragraph of paragraphs) {
        if (paragraph.length <= CHUNK_SIZE) {
            chunks.push(paragraph);
            continue;
        }
        let start = 0;
        while (start < paragraph.length) {
            const end = Math.min(start + CHUNK_SIZE, paragraph.length);
            chunks.push(paragraph.slice(start, end).trim());
            if (end === paragraph.length)
                break;
            start = end - CHUNK_OVERLAP;
        }
    }
    return chunks.filter(Boolean);
}
async function callEmbeddings(prisma, input) {
    const { embed } = await import('./aiProvider.js');
    return embed(prisma, input);
}
export async function embedText(prisma, text) {
    const [result] = await callEmbeddings(prisma, [text]);
    return result;
}
export async function embedBatch(prisma, texts) {
    if (texts.length === 0)
        return [];
    return callEmbeddings(prisma, texts);
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
export async function retrieveRelevantChunks(prisma, tenantId, knowledgeBaseId, queryEmbedding, topK = 4) {
    const chunks = await prisma.knowledgeChunk.findMany({
        where: { tenantId, knowledgeBaseId },
        select: { id: true, content: true, documentId: true, embedding: true },
    });
    // Vectors from different embedding models are not comparable, and
    // cosineSimilarity returns 0 for a length mismatch rather than throwing. So
    // after a provider switch every chunk would score zero, the bot would answer
    // "I don't know" to everything, and nothing would say why. Count the
    // mismatches and say so.
    const usable = chunks.filter((c) => c.embedding.length === queryEmbedding.length);
    const stale = chunks.length - usable.length;
    if (stale > 0) {
        console.warn(`[KB] ${stale} of ${chunks.length} chunks in ${knowledgeBaseId} were embedded by a different model ` +
            `(${queryEmbedding.length} dimensions expected) and cannot be searched until re-indexed.`);
    }
    return usable
        .map((c) => ({
        id: c.id,
        content: c.content,
        documentId: c.documentId,
        similarity: cosineSimilarity(queryEmbedding, c.embedding),
    }))
        .filter((c) => c.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}
/**
 * How many chunks were embedded by a model other than the current one, and so
 * are invisible to search until re-indexed.
 */
export async function countStaleChunks(prisma, tenantId, knowledgeBaseId) {
    const { embeddingDimensions } = await import('./aiProvider.js');
    const expected = await embeddingDimensions(prisma);
    const chunks = await prisma.knowledgeChunk.findMany({
        where: { ...(tenantId ? { tenantId } : {}), ...(knowledgeBaseId ? { knowledgeBaseId } : {}) },
        select: { embedding: true },
    });
    return {
        total: chunks.length,
        stale: chunks.filter((c) => c.embedding.length !== expected).length,
        expectedDimensions: expected,
    };
}
/**
 * Full RAG pipeline: embed the query, retrieve relevant chunks, generate a
 * grounded reply. Returns null on any failure (no provider configured,
 * embedding failure, no relevant chunks, or generation failure) — never throws.
 */
export async function generateRagReply(params) {
    const { prisma, tenantId, knowledgeBaseId, systemPrompt, userMessage, guardrails } = params;
    const queryEmbedding = await embedText(prisma, userMessage);
    if (!queryEmbedding)
        return null;
    const chunks = await retrieveRelevantChunks(prisma, tenantId, knowledgeBaseId, queryEmbedding);
    if (chunks.length === 0)
        return null;
    const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
    const { chatCompletion } = await import('./aiProvider.js');
    const { buildSystemPrompt, prepareUserMessage } = await import('./aiGuardrails.js');
    const system = guardrails
        ? buildSystemPrompt({ ...guardrails, context })
        : `${systemPrompt}\n\nAnswer only using the context below. If the context doesn't contain the answer, ` +
            `say you're not sure and offer to connect them with a human — never invent information.\n\n` +
            `Context:\n${context}`;
    const result = await chatCompletion(prisma, {
        system,
        user: guardrails ? prepareUserMessage(userMessage) : userMessage,
        maxTokens: 400,
        temperature: 0.3,
        timeoutMs: 15000,
        tenantId,
        feature: 'chatbot-rag',
    });
    if (!result)
        return null;
    return { reply: result.content, chunks };
}
//# sourceMappingURL=knowledgeBase.js.map