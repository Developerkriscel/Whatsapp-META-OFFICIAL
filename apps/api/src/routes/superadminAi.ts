/**
 * AI provider configuration, superadmin only.
 *
 * The provider and its key were environment variables, which made choosing
 * between Mistral and OpenAI a redeploy. They are platform settings now, and
 * the key is stored encrypted like every other credential here.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getProviderStatus,
  saveProviderSettings,
  testProvider,
  clearProviderCache,
} from '../services/aiProvider.js';
import { countStaleChunks } from '../services/knowledgeBase.js';
import { requireSuperadmin } from '../middleware/auth.js';

export async function registerAiAdminRoutes(app: FastifyInstance) {
  // Every route below is platform configuration. Without this a tenant's own
  // token reached them -- readable provider settings, and writable API keys.
  app.addHook('preHandler', requireSuperadmin());

  /** Which providers exist, which is active, and whether each has a key. */
  app.get('/ai', async () => {
    const status = await getProviderStatus(app.prisma);

    // Switching provider changes the embedding model, and vectors from two
    // models are not comparable. Report how many stored chunks the current
    // provider cannot search, so the consequence is visible before it shows up
    // as a chatbot that has forgotten everything.
    let knowledge: { total: number; stale: number; expectedDimensions: number } | null = null;
    try {
      knowledge = await countStaleChunks(app.prisma);
    } catch {
      knowledge = null;
    }

    return { success: true, data: { ...status, knowledge } };
  });

  /** Set the active provider, a key, or a model name. */
  app.patch('/ai', async (request, reply) => {
    const body = z
      .object({
        provider: z.enum(['mistral', 'openai']).optional(),
        forProvider: z.enum(['mistral', 'openai']).optional(),
        apiKey: z.string().min(10).max(500).optional(),
        chatModel: z.string().min(1).max(100).optional(),
      })
      .parse(request.body);

    if (!body.provider && !body.apiKey && !body.chatModel) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NOTHING_TO_UPDATE', message: 'Provide a provider, an API key or a model name.' },
      });
    }

    if ((body.apiKey || body.chatModel) && !body.forProvider && !body.provider) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'PROVIDER_REQUIRED',
          message: 'Say which provider the key or model belongs to.',
        },
      });
    }

    await saveProviderSettings(app.prisma, body);
    const status = await getProviderStatus(app.prisma);
    return { success: true, data: status };
  });

  /**
   * Sends one real request. "A key is stored" and "the key works" are
   * different claims, and only this one can make the second.
   */
  app.post('/ai/test', async (request) => {
    const body = z
      .object({ provider: z.enum(['mistral', 'openai']).optional() })
      .parse(request.body ?? {});
    const result = await testProvider(app.prisma, body.provider);
    return { success: true, data: result };
  });

  /** Drops the cached provider, for when a key is rotated out of band. */
  app.post('/ai/reload', async () => {
    clearProviderCache();
    const status = await getProviderStatus(app.prisma);
    return { success: true, data: status };
  });
}
