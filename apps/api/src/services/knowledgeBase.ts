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

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const MIN_SIMILARITY = 0.5;

export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= CHUNK_SIZE) {
      chunks.push(paragraph);
      continue;
    }
    let start = 0;
    while (start < paragraph.length) {
      const end = Math.min(start + CHUNK_SIZE, paragraph.length);
      chunks.push(paragraph.slice(start, end).trim());
      if (end === paragraph.length) break;
      start = end - CHUNK_OVERLAP;
    }
  }
  return chunks.filter(Boolean);
}

async function callEmbeddings(prisma: PrismaClient, input: string[]): Promise<(number[] | null)[]> {
  const { embed } = await import('./aiProvider.js');
  return embed(prisma, input);
}

export async function embedText(prisma: PrismaClient, text: string): Promise<number[] | null> {
  const [result] = await callEmbeddings(prisma, [text]);
  return result;
}

export async function embedBatch(prisma: PrismaClient, texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  return callEmbeddings(prisma, texts);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RetrievedChunk {
  id: string;
  content: string;
  documentId: string;
  similarity: number;
}

export async function retrieveRelevantChunks(
  prisma: PrismaClient,
  tenantId: string,
  knowledgeBaseId: string,
  queryEmbedding: number[],
  topK = 4
): Promise<RetrievedChunk[]> {
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
    console.warn(
      `[KB] ${stale} of ${chunks.length} chunks in ${knowledgeBaseId} were embedded by a different model ` +
      `(${queryEmbedding.length} dimensions expected) and cannot be searched until re-indexed.`,
    );
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
export async function countStaleChunks(
  prisma: PrismaClient,
  tenantId?: string,
  knowledgeBaseId?: string,
): Promise<{ total: number; stale: number; expectedDimensions: number }> {
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
 * grounded reply. Returns null on any failure (no provider configured,
 * embedding failure, no relevant chunks, or generation failure) — never throws.
 */
export async function generateRagReply(params: GenerateRagReplyParams): Promise<RagReplyResult | null> {
  const { prisma, tenantId, knowledgeBaseId, systemPrompt, userMessage } = params;

  const queryEmbedding = await embedText(prisma, userMessage);
  if (!queryEmbedding) return null;

  const chunks = await retrieveRelevantChunks(prisma, tenantId, knowledgeBaseId, queryEmbedding);
  if (chunks.length === 0) return null;

  const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');

  const { chatCompletion } = await import('./aiProvider.js');
  const result = await chatCompletion(prisma, {
    system:
      `${systemPrompt}\n\nAnswer only using the context below. If the context doesn't contain the answer, ` +
      `say you're not sure and offer to connect them with a human — never invent information.\n\n` +
      `Context:\n${context}`,
    user: userMessage,
    maxTokens: 400,
    temperature: 0.3,
    timeoutMs: 15000,
  });
  if (!result) return null;

  return { reply: result.content, chunks };
}
