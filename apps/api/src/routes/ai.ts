/**
 * AI availability check — lets the frontend decide once whether to render
 * any AI-suggestion buttons, instead of discovering it per-module.
 */

import { FastifyInstance } from 'fastify';
import { isAIAvailable } from '../services/aiAssist.js';

export async function registerAIRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ai/status', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    return { success: true, data: { available: isAIAvailable() } };
  });
}
