import { describe, it, expect, vi } from 'vitest';
import { processWhatsAppWebhook } from './webhooks.js';

function makeMockApp(phoneNumberRecord: any) {
  const contact = { id: 'contact-1', name: 'Test Contact', phone: '15551234567' };
  const conversation = { id: 'conversation-1' };

  const prisma = {
    phoneNumber: {
      findUnique: vi.fn().mockResolvedValue(phoneNumberRecord),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(contact),
      create: vi.fn().mockResolvedValue(contact),
      update: vi.fn().mockResolvedValue(contact),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(conversation),
      create: vi.fn().mockResolvedValue(conversation),
      update: vi.fn().mockResolvedValue(conversation),
      count: vi.fn().mockResolvedValue(0),
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: 'message-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    webhookLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  return { prisma } as any;
}

function makeIncomingMessagePayload(phoneNumberId: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [
                {
                  from: '15551234567',
                  id: 'wamid.test123',
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  type: 'text',
                  text: { body: 'hello there' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('processWhatsAppWebhook - tenant routing', () => {
  it('routes an incoming message to the tenant that owns the matching phone number', async () => {
    const phoneNumberRecord = {
      id: 'phone-1',
      tenantId: 'tenant-abc',
      metaPhoneId: 'meta-phone-999',
    };
    const app = makeMockApp(phoneNumberRecord);

    await processWhatsAppWebhook(app, makeIncomingMessagePayload('meta-phone-999'));

    expect(app.prisma.phoneNumber.findUnique).toHaveBeenCalledWith({
      where: { metaPhoneId: 'meta-phone-999' },
      include: { tenant: true },
    });

    // Every downstream write must be scoped to the tenant that owns the phone number.
    expect(app.prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-abc', phone: '15551234567' },
    });
    expect(app.prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-abc', contactId: 'contact-1', phoneNumberId: 'phone-1' },
    });
    expect(app.prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-abc' }),
      })
    );
  });

  it('does not process a message for a phone number that maps to no tenant', async () => {
    const app = makeMockApp(null);

    await processWhatsAppWebhook(app, makeIncomingMessagePayload('unregistered-phone-id'));

    expect(app.prisma.phoneNumber.findUnique).toHaveBeenCalledWith({
      where: { metaPhoneId: 'unregistered-phone-id' },
      include: { tenant: true },
    });

    // No tenant was resolved, so nothing downstream should ever run - this is
    // what prevents an unmapped webhook from being misattributed to any tenant.
    expect(app.prisma.contact.findFirst).not.toHaveBeenCalled();
    expect(app.prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(app.prisma.message.create).not.toHaveBeenCalled();
  });

  it('routes each change to the correct tenant when multiple phone numbers are involved', async () => {
    const lookups: Record<string, any> = {
      'phone-for-tenant-a': { id: 'phone-a', tenantId: 'tenant-a', metaPhoneId: 'phone-for-tenant-a' },
      'phone-for-tenant-b': { id: 'phone-b', tenantId: 'tenant-b', metaPhoneId: 'phone-for-tenant-b' },
    };

    const app = makeMockApp(null);
    app.prisma.phoneNumber.findUnique = vi.fn(({ where }: any) =>
      Promise.resolve(lookups[where.metaPhoneId] ?? null)
    );

    const payload = {
      entry: [
        {
          changes: [
            { value: { metadata: { phone_number_id: 'phone-for-tenant-a' }, messages: [{ from: '1', id: 'm1', timestamp: `${Math.floor(Date.now() / 1000)}`, type: 'text', text: { body: 'hi' } }] } },
            { value: { metadata: { phone_number_id: 'phone-for-tenant-b' }, messages: [{ from: '2', id: 'm2', timestamp: `${Math.floor(Date.now() / 1000)}`, type: 'text', text: { body: 'hi' } }] } },
          ],
        },
      ],
    };

    await processWhatsAppWebhook(app, payload);

    const tenantIdsUsed = app.prisma.contact.findFirst.mock.calls.map((call: any) => call[0].where.tenantId);
    expect(tenantIdsUsed).toEqual(['tenant-a', 'tenant-b']);
  });
});
