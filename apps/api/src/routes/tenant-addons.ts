/**
 * Add-ons Routes - Manage tenant add-ons (extra contacts, phone numbers, etc.)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const addAddonSchema = z.object({
  addonId: z.string(),
  quantity: z.number().default(1),
});

/**
 * Register add-on routes
 */
export async function registerAddOnRoutes(app: FastifyInstance): Promise<void> {
  // ============================================
  // GET /addons - List available add-ons
  // ============================================

  app.get('/addons', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const addOns = [
      {
        id: 'addon_extra_phone',
        name: 'Extra Phone Number',
        description: 'Add an additional WhatsApp Business phone number.',
        monthlyPrice: 15,
        annualPrice: 144,
        isPerUnit: true,
        unitName: 'phone number',
        icon: 'phone',
      },
      {
        id: 'addon_extra_contacts',
        name: 'Extra Contacts Pack',
        description: 'Add 1,000 additional contacts to your limit.',
        monthlyPrice: 10,
        annualPrice: 96,
        isPerUnit: true,
        unitName: '1K contacts',
        icon: 'users',
      },
      {
        id: 'addon_extra_messages',
        name: 'Extra Messages Pack',
        description: 'Add 5,000 additional messages per month.',
        monthlyPrice: 15,
        annualPrice: 144,
        isPerUnit: true,
        unitName: '5K messages',
        icon: 'message',
      },
      {
        id: 'addon_ai_chatbot',
        name: 'AI Chatbot',
        description: 'Enable AI-powered chatbot responses.',
        monthlyPrice: 49,
        annualPrice: 470,
        isPerUnit: false,
        icon: 'bot',
      },
      {
        id: 'addon_white_label',
        name: 'White Label',
        description: 'Remove WhatsApp SaaS branding.',
        monthlyPrice: 199,
        annualPrice: 1910,
        isPerUnit: false,
        icon: 'globe',
      },
      {
        id: 'addon_priority_support',
        name: 'Priority Support',
        description: '24/7 priority support with 1-hour response time.',
        monthlyPrice: 99,
        annualPrice: 950,
        isPerUnit: false,
        icon: 'headphones',
      },
    ];

    return { success: true, data: addOns };
  });

  // ============================================
  // GET /addons/active - List tenant's active add-ons
  // ============================================

  app.get('/addons/active', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const activeAddons = await app.prisma.tenantAddon.findMany({
      where: { tenantId: request.authUser.tenantId, status: 'active' },
    });

    return { success: true, data: activeAddons };
  });

  // ============================================
  // POST /addons - Add an add-on
  // ============================================

  app.post('/addons', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = addAddonSchema.parse(request.body);

    const tenantAddon = await app.prisma.tenantAddon.upsert({
      where: {
        tenantId_addonId: {
          tenantId: request.authUser.tenantId,
          addonId: body.addonId,
        },
      },
      update: {
        status: 'active',
      },
      create: {
        tenantId: request.authUser.tenantId,
        addonId: body.addonId,
        addonName: body.addonId,
        status: 'active',
      },
    });

    return reply.status(201).send({ success: true, data: tenantAddon });
  });

  // ============================================
  // DELETE /addons/:addonId - Remove an add-on
  // ============================================

  app.delete('/addons/:addonId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { addonId } = z.object({ addonId: z.string() }).parse(request.params);

    await app.prisma.tenantAddon.update({
      where: {
        tenantId_addonId: {
          tenantId: request.authUser.tenantId,
          addonId,
        },
      },
      data: { status: 'canceled' },
    });

    return { success: true, data: { message: 'Add-on removed' } };
  });
}