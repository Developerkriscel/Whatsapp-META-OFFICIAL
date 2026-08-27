/**
 * Knowledge Base — RAG (retrieval-augmented generation) support for the
 * `ai_reply` chatbot flow step. Same Mistral integration pattern as
 * aiAssist.ts: every call is wrapped so a missing MISTRAL_API_KEY or a
 * network/API failure returns null instead of throwing, so callers can
 * always fall back to a static message rather than the bot going silent.
 */
import axios from 'axios';
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
async function callEmbeddings(input) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey)
        return input.map(() => null);
    try {
        const response = await axios.post('https://api.mistral.ai/v1/embeddings', { model: 'mistral-embed', input }, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        const data = response.data?.data || [];
        // Mistral returns results in the same order as the input array, each
        // tagged with its own "index" — sort defensively rather than assume.
        const byIndex = new Map();
        for (const item of data) {
            if (Array.isArray(item?.embedding))
                byIndex.set(item.index, item.embedding);
        }
        return input.map((_, i) => byIndex.get(i) ?? null);
    }
    catch (err) {
        return input.map(() => null);
    }
}
export async function embedText(text) {
    const [result] = await callEmbeddings([text]);
    return result;
}
export async function embedBatch(texts) {
    if (texts.length === 0)
        return [];
    return callEmbeddings(texts);
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
    return chunks
        .map((c) => ({
        id: c.id,
        content: c.content,
        documentId: c.documentId,
        similarity: cosineSimilarity(queryEmbedding, c.embedding),
    }))
        .filter((c) => c.similarity >= MIN_SIMILARITY)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}
/**
 * Full RAG pipeline: embed the query, retrieve relevant chunks, generate a
 * grounded reply. Returns null on any failure (no API key, embedding
 * failure, no relevant chunks, or generation failure) — never throws.
 */
export async function generateRagReply(params) {
    const { prisma, tenantId, knowledgeBaseId, systemPrompt, userMessage } = params;
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey)
        return null;
    const queryEmbedding = await embedText(userMessage);
    if (!queryEmbedding)
        return null;
    const chunks = await retrieveRelevantChunks(prisma, tenantId, knowledgeBaseId, queryEmbedding);
    if (chunks.length === 0)
        return null;
    const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model,
            messages: [
                {
                    role: 'system',
                    content: `${systemPrompt}\n\nAnswer only using the context below. If the context doesn't contain the answer, say you're not sure and offer to connect them with a human — never invent information.\n\nContext:\n${context}`,
                },
                { role: 'user', content: userMessage },
            ],
            max_tokens: 400,
            temperature: 0.3,
        }, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        const reply = response.data?.choices?.[0]?.message?.content?.trim();
        if (!reply)
            return null;
        return { reply, chunks };
    }
    catch (err) {
        return null;
    }
}
//# sourceMappingURL=knowledgeBase.js.map