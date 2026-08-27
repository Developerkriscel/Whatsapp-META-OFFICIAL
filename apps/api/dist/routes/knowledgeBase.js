/**
 * Knowledge Base routes — CRUD for RAG knowledge bases/documents used by the
 * `ai_reply` chatbot flow step, plus a test endpoint to preview a reply
 * before wiring the knowledge base into a live flow.
 */
import { z } from 'zod';
import { chunkText, embedBatch, generateRagReply } from '../services/knowledgeBase.js';
export async function registerKnowledgeBaseRoutes(app) {
    app.get('/knowledge-bases', { preHandler: [app.requirePermission('flows', 'read')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const bases = await app.prisma.knowledgeBase.findMany({
            where: { tenantId: request.authUser.tenantId },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { documents: true, chunks: true } } },
        });
        return {
            success: true,
            data: bases.map((b) => ({
                id: b.id,
                name: b.name,
                description: b.description,
                documentCount: b._count.documents,
                chunkCount: b._count.chunks,
                createdAt: b.createdAt,
            })),
        };
    });
    app.post('/knowledge-bases', { preHandler: [app.requirePermission('flows', 'create')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const body = z.object({ name: z.string().min(1), description: z.string().optional() }).parse(request.body);
        const kb = await app.prisma.knowledgeBase.create({
            data: { tenantId: request.authUser.tenantId, name: body.name, description: body.description },
        });
        return { success: true, data: kb };
    });
    app.delete('/knowledge-bases/:id', { preHandler: [app.requirePermission('flows', 'delete')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const kb = await app.prisma.knowledgeBase.findFirst({ where: { id, tenantId: request.authUser.tenantId } });
        if (!kb) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        await app.prisma.knowledgeBase.delete({ where: { id } });
        return { success: true };
    });
    app.get('/knowledge-bases/:id/documents', { preHandler: [app.requirePermission('flows', 'read')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const kb = await app.prisma.knowledgeBase.findFirst({ where: { id, tenantId: request.authUser.tenantId } });
        if (!kb) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const documents = await app.prisma.knowledgeDocument.findMany({
            where: { knowledgeBaseId: id },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { chunks: true } } },
        });
        return {
            success: true,
            data: documents.map((d) => ({
                id: d.id,
                title: d.title,
                status: d.status,
                errorMessage: d.errorMessage,
                chunkCount: d._count.chunks,
                createdAt: d.createdAt,
            })),
        };
    });
    app.post('/knowledge-bases/:id/documents', { preHandler: [app.requirePermission('flows', 'create')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const tenantId = request.authUser.tenantId;
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const body = z.object({ title: z.string().min(1), content: z.string().min(1) }).parse(request.body);
        const kb = await app.prisma.knowledgeBase.findFirst({ where: { id, tenantId } });
        if (!kb) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const document = await app.prisma.knowledgeDocument.create({
            data: { knowledgeBaseId: id, tenantId, title: body.title, content: body.content, status: 'PENDING' },
        });
        const chunks = chunkText(body.content);
        if (chunks.length === 0) {
            const updated = await app.prisma.knowledgeDocument.update({
                where: { id: document.id },
                data: { status: 'FAILED', errorMessage: 'No content to embed' },
            });
            return { success: true, data: updated };
        }
        const embeddings = await embedBatch(chunks);
        const failedCount = embeddings.filter((e) => e === null).length;
        if (failedCount === embeddings.length) {
            const updated = await app.prisma.knowledgeDocument.update({
                where: { id: document.id },
                data: {
                    status: 'FAILED',
                    errorMessage: process.env.MISTRAL_API_KEY
                        ? 'Embedding failed for all chunks — check server logs'
                        : 'AI is not configured for this deployment (missing MISTRAL_API_KEY)',
                },
            });
            return { success: true, data: updated };
        }
        await app.prisma.knowledgeChunk.createMany({
            data: chunks
                .map((content, i) => ({ content, embedding: embeddings[i] }))
                .filter((c) => c.embedding !== null)
                .map((c) => ({
                knowledgeBaseId: id,
                documentId: document.id,
                tenantId,
                content: c.content,
                embedding: c.embedding,
            })),
        });
        const updated = await app.prisma.knowledgeDocument.update({
            where: { id: document.id },
            data: {
                status: failedCount > 0 ? 'FAILED' : 'EMBEDDED',
                errorMessage: failedCount > 0 ? `${failedCount}/${chunks.length} chunks failed to embed` : null,
            },
        });
        return { success: true, data: updated };
    });
    app.delete('/knowledge-bases/:id/documents/:docId', { preHandler: [app.requirePermission('flows', 'delete')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id, docId } = z.object({ id: z.string(), docId: z.string() }).parse(request.params);
        const doc = await app.prisma.knowledgeDocument.findFirst({
            where: { id: docId, knowledgeBaseId: id, tenantId: request.authUser.tenantId },
        });
        if (!doc) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        await app.prisma.knowledgeDocument.delete({ where: { id: docId } });
        return { success: true };
    });
    app.post('/knowledge-bases/:id/test', { preHandler: [app.requirePermission('flows', 'read')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const tenantId = request.authUser.tenantId;
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const body = z.object({ question: z.string().min(1), systemPrompt: z.string().optional() }).parse(request.body);
        const kb = await app.prisma.knowledgeBase.findFirst({ where: { id, tenantId } });
        if (!kb) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const result = await generateRagReply({
            prisma: app.prisma,
            tenantId,
            knowledgeBaseId: id,
            systemPrompt: body.systemPrompt || 'You are a helpful assistant.',
            userMessage: body.question,
        });
        if (!result) {
            return {
                success: true,
                data: { reply: null, chunks: [], message: 'No confident answer found — check AI is configured and the knowledge base has relevant content.' },
            };
        }
        return {
            success: true,
            data: {
                reply: result.reply,
                chunks: result.chunks.map((c) => ({ content: c.content, similarity: Math.round(c.similarity * 100) / 100 })),
            },
        };
    });
}
//# sourceMappingURL=knowledgeBase.js.map