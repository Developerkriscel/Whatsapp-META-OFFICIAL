// Database Seed Script
// Creates demo data for development and testing

import { PrismaClient, UserRole, TenantStatus, PlanTier, TemplateCategory, TemplateStatus, MessageDirection, MessageType, MessageStatus, ConversationStatus, TicketStatus, TicketPriority } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ============================================
  // Create Plans
  // ============================================
  console.log('📦 Creating pricing plans...');

  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { tier: PlanTier.STARTER },
      update: {},
      create: {
        name: 'Starter',
        tier: PlanTier.STARTER,
        monthlyPrice: 49,
        annualPrice: 470,
        description: 'Perfect for small businesses just getting started.',
        maxContacts: 500,
        maxMessagesPerMonth: 5000,
        maxPhoneNumbers: 1,
        maxTeamMembers: 3,
        maxChatbotFlows: 1,
        maxCampaigns: 10,
        maxSegments: 5,
        maxContactsPerCampaign: 500,
        maxTemplates: 10,
        maxAPIKeys: 1,
        maxCampaignsPerDay: 5,
        maxMessagesPerMinute: 10,
        maxMessagesPerHour: 30,
        hasAnalytics: true,
        hasChatbotBuilder: false,
        hasWhatsAppFlows: false,
        hasAPI: false,
        hasAIChatbot: false,
        hasCustomBranding: false,
        hasPrioritySupport: false,
        hasAdvancedAnalytics: false,
        hasWhiteLabel: false,
        hasDripCampaigns: false,
        hasABTesting: false,
        hasContactImport: true,
        hasBulkExport: true,
        overageContacts: 0.02,
        overageMessages: 0.008,
        webhookRetries: 3,
        dataRetentionDays: 30,
        sortOrder: 1,
        isPublic: true,
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { tier: PlanTier.GROWTH },
      update: {},
      create: {
        name: 'Growth',
        tier: PlanTier.GROWTH,
        monthlyPrice: 149,
        annualPrice: 1430,
        description: 'For growing teams that need automation and API access.',
        maxContacts: 2500,
        maxMessagesPerMonth: 25000,
        maxPhoneNumbers: 3,
        maxTeamMembers: 10,
        maxChatbotFlows: 10,
        maxCampaigns: 50,
        maxSegments: 25,
        maxContactsPerCampaign: 2500,
        maxTemplates: 50,
        maxAPIKeys: 5,
        maxCampaignsPerDay: 20,
        maxMessagesPerMinute: 50,
        maxMessagesPerHour: 100,
        hasAnalytics: true,
        hasChatbotBuilder: true,
        hasWhatsAppFlows: false,
        hasAPI: true,
        hasAIChatbot: false,
        hasCustomBranding: false,
        hasPrioritySupport: false,
        hasAdvancedAnalytics: false,
        hasWhiteLabel: false,
        hasDripCampaigns: false,
        hasABTesting: false,
        hasContactImport: true,
        hasBulkExport: true,
        overageContacts: 0.015,
        overageMessages: 0.006,
        webhookRetries: 5,
        dataRetentionDays: 90,
        sortOrder: 2,
        isPopular: true,
        isPublic: true,
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { tier: PlanTier.BUSINESS },
      update: {},
      create: {
        name: 'Business',
        tier: PlanTier.BUSINESS,
        monthlyPrice: 399,
        annualPrice: 3830,
        description: 'Full-featured with AI chatbot, Flows, and advanced analytics.',
        maxContacts: 10000,
        maxMessagesPerMonth: 100000,
        maxPhoneNumbers: 10,
        maxTeamMembers: 25,
        maxChatbotFlows: 50,
        maxCampaigns: 200,
        maxSegments: 100,
        maxContactsPerCampaign: 10000,
        maxTemplates: 200,
        maxAPIKeys: 20,
        maxCampaignsPerDay: 100,
        maxMessagesPerMinute: 200,
        maxMessagesPerHour: 500,
        hasAnalytics: true,
        hasChatbotBuilder: true,
        hasWhatsAppFlows: true,
        hasAPI: true,
        hasAIChatbot: true,
        hasCustomBranding: true,
        hasPrioritySupport: true,
        hasAdvancedAnalytics: true,
        hasWhiteLabel: false,
        hasDripCampaigns: true,
        hasABTesting: true,
        hasContactImport: true,
        hasBulkExport: true,
        overageContacts: 0.01,
        overageMessages: 0.004,
        webhookRetries: 10,
        dataRetentionDays: 365,
        sortOrder: 3,
        isPublic: true,
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { tier: PlanTier.ENTERPRISE },
      update: {},
      create: {
        name: 'Enterprise',
        tier: PlanTier.ENTERPRISE,
        monthlyPrice: -1,
        annualPrice: -1,
        description: 'Unlimited scale with white-label and dedicated support.',
        maxContacts: -1,
        maxMessagesPerMonth: -1,
        maxPhoneNumbers: -1,
        maxTeamMembers: -1,
        maxChatbotFlows: -1,
        maxCampaigns: -1,
        maxSegments: -1,
        maxContactsPerCampaign: -1,
        maxTemplates: -1,
        maxAPIKeys: -1,
        maxCampaignsPerDay: -1,
        maxMessagesPerMinute: -1,
        maxMessagesPerHour: -1,
        hasAnalytics: true,
        hasChatbotBuilder: true,
        hasWhatsAppFlows: true,
        hasAPI: true,
        hasAIChatbot: true,
        hasCustomBranding: true,
        hasPrioritySupport: true,
        hasAdvancedAnalytics: true,
        hasWhiteLabel: true,
        hasDripCampaigns: true,
        hasABTesting: true,
        hasContactImport: true,
        hasBulkExport: true,
        webhookRetries: -1,
        dataRetentionDays: -1,
        sortOrder: 4,
        isPublic: true,
        isActive: true,
      },
    }),
  ]);

  console.log(`✅ Created ${plans.length} plans\n`);

  // ============================================
  // Create Superadmin
  // ============================================
  console.log('🔐 Creating super admin...');

  const hashedPassword = await bcrypt.hash('admin123', 12);

  const superadmin = await prisma.superadmin.upsert({
    where: { email: 'admin@whatsapp-saas.com' },
    update: {},
    create: {
      email: 'admin@whatsapp-saas.com',
      name: 'Platform Admin',
      password: hashedPassword,
      role: UserRole.SUPERADMIN,
      isActive: true,
    },
  });

  console.log(`✅ Created super admin: ${superadmin.email}\n`);

  // ============================================
  // Create Demo Tenant
  // ============================================
  console.log('🏢 Creating demo tenant...');

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 14);

  const demoTenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant-id' },
    update: {},
    create: {
      id: 'demo-tenant-id',
      name: 'Acme Corporation',
      website: 'https://acme-corp.com',
      timezone: 'America/New_York',
      defaultLanguage: 'en',
      industry: 'Technology',
      useCase: 'Customer Support',
      status: TenantStatus.ACTIVE,
      planId: plans[1].id, // Growth plan
      trialEndsAt: trialEndDate,
      isOnTrial: false,
      currentContacts: 1250,
      currentMessages: 18500,
      billingEmail: 'billing@acme-corp.com',
      qualityScore: 'GREEN',
    },
  });

  console.log(`✅ Created demo tenant: ${demoTenant.name}\n`);

  // ============================================
  // Create Tenant Users
  // ============================================
  console.log('👥 Creating tenant users...');

  const userPassword = await bcrypt.hash('demo123', 12);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: demoTenant.id, email: 'owner@demo.com' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        email: 'owner@demo.com',
        name: 'John Owner',
        password: userPassword,
        role: UserRole.OWNER,
        isActive: true,
        isVerified: true,
        lastLoginAt: new Date(),
      },
    }),
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: demoTenant.id, email: 'admin@demo.com' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        email: 'admin@demo.com',
        name: 'Sarah Admin',
        password: userPassword,
        role: UserRole.ADMIN,
        isActive: true,
        isVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: demoTenant.id, email: 'manager@demo.com' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        email: 'manager@demo.com',
        name: 'Mike Manager',
        password: userPassword,
        role: UserRole.MANAGER,
        isActive: true,
        isVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: demoTenant.id, email: 'agent1@demo.com' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        email: 'agent1@demo.com',
        name: 'Emily Agent',
        password: userPassword,
        role: UserRole.AGENT,
        isActive: true,
        isVerified: true,
        maxChats: 8,
      },
    }),
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: demoTenant.id, email: 'agent2@demo.com' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        email: 'agent2@demo.com',
        name: 'David Agent',
        password: userPassword,
        role: UserRole.AGENT,
        isActive: true,
        isVerified: true,
        maxChats: 5,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} tenant users\n`);

  // ============================================
  // Create Phone Numbers
  // ============================================
  console.log('📱 Creating phone numbers...');

  const phoneNumber = await prisma.phoneNumber.upsert({
    where: { metaPhoneId: 'demo-phone-1' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      phoneNumber: '+1234567890',
      displayName: 'Acme Support',
      metaPhoneId: 'demo-phone-1',
      status: 'verified',
      qualityScore: 'GREEN',
      canSendSales: true,
      canSendMarketing: true,
      canSendUtility: true,
      canSendAuth: true,
      timezone: 'America/New_York',
      verifiedAt: new Date(),
      dailySentLimit: 1000,
    },
  });

  console.log(`✅ Created phone number: ${phoneNumber.phoneNumber}\n`);

  // ============================================
  // Create Contacts
  // ============================================
  console.log('📒 Creating contacts...');

  const contactData = [
    { phone: '+15551112222', name: 'Alice Johnson', email: 'alice@example.com', company: 'Tech Inc', city: 'New York' },
    { phone: '+15553334444', name: 'Bob Smith', email: 'bob@example.com', company: 'Startup Co', city: 'San Francisco' },
    { phone: '+15555556666', name: 'Carol Williams', email: 'carol@example.com', company: 'BigCorp', city: 'Chicago' },
    { phone: '+15557778888', name: 'David Brown', email: 'david@example.com', company: 'Agency', city: 'Austin' },
    { phone: '+15559990000', name: 'Eva Martinez', email: 'eva@example.com', company: 'Design Studio', city: 'Los Angeles' },
  ];

  const contacts = await Promise.all(
    contactData.map((data) =>
      prisma.contact.upsert({
        where: { tenantId_phone: { tenantId: demoTenant.id, phone: data.phone } },
        update: {},
        create: {
          tenantId: demoTenant.id,
          ...data,
          isActive: true,
          totalMessagesReceived: Math.floor(Math.random() * 100) + 10,
          totalMessagesSent: Math.floor(Math.random() * 50) + 5,
          lastMessageAt: new Date(),
        },
      })
    )
  );

  console.log(`✅ Created ${contacts.length} contacts\n`);

  // ============================================
  // Create Conversations
  // ============================================
  console.log('💬 Creating conversations...');

  const conversations = await Promise.all(
    contacts.slice(0, 3).map((contact, index) =>
      prisma.conversation.upsert({
        where: { contactId_phoneNumberId_tenantId: { contactId: contact.id, phoneNumberId: phoneNumber.id, tenantId: demoTenant.id } },
        update: {},
        create: {
          tenantId: demoTenant.id,
          contactId: contact.id,
          phoneNumberId: phoneNumber.id,
          status: index === 0 ? ConversationStatus.OPEN : (index === 1 ? ConversationStatus.PENDING_AGENT : ConversationStatus.CLOSED),
          assignedToId: index < 2 ? users[index % 2 + 3].id : null,
          isBotActive: index === 0,
          lastMessageAt: new Date(),
        },
      })
    )
  );

  console.log(`✅ Created ${conversations.length} conversations\n`);

  // ============================================
  // Create Messages
  // ============================================
  console.log('✉️ Creating messages...');

  const messageTemplates = [
    { body: 'Hi, I need help with my order', direction: MessageDirection.INCOMING, type: MessageType.TEXT },
    { body: 'Hello! I\'d be happy to help. Can you provide your order number?', direction: MessageDirection.OUTGOING, type: MessageType.TEXT },
    { body: 'It\'s ORD-12345', direction: MessageDirection.INCOMING, type: MessageType.TEXT },
    { body: 'Thank you! I found your order. It\'s currently being processed and will ship tomorrow.', direction: MessageDirection.OUTGOING, type: MessageType.TEXT },
    { body: 'Great, thanks!', direction: MessageDirection.INCOMING, type: MessageType.TEXT },
  ];

  const messages = await Promise.all(
    messageTemplates.slice(0, 5).map((msg, index) =>
      prisma.message.create({
        data: {
          tenantId: demoTenant.id,
          conversationId: conversations[0].id,
          contactId: contacts[0].id,
          senderId: msg.direction === MessageDirection.OUTGOING ? users[0].id : null,
          phoneNumberId: phoneNumber.id,
          direction: msg.direction,
          type: msg.type,
          body: msg.body,
          status: MessageStatus.DELIVERED,
          sentAt: new Date(Date.now() - (5 - index) * 60000),
          deliveredAt: new Date(Date.now() - (5 - index) * 60000 + 5000),
        },
      })
    )
  );

  console.log(`✅ Created ${messages.length} messages\n`);

  // ============================================
  // Create Templates
  // ============================================
  console.log('📝 Creating templates...');

  const templates = await Promise.all([
    prisma.template.upsert({
      where: { metaTemplateId: 'demo_template_welcome' },
      update: {},
      create: {
        tenantId: demoTenant.id,
        metaTemplateId: 'demo_template_welcome',
        name: 'welcome_message',
        category: TemplateCategory.UTILITY,
        language: 'en_US',
        status: TemplateStatus.APPROVED,
        body: {
          type: 'body',
          text: 'Hi {{1}}! Welcome to {{2}}. How can we help you today?',
        },
        totalSent: 150,
        approvedAt: new Date(),
      },
    }),
    prisma.template.upsert({
      where: { metaTemplateId: 'demo_template_shipping' },
      update: {},
      create: {
        tenantId: demoTenant.id,
        metaTemplateId: 'demo_template_shipping',
        name: 'order_shipped',
        category: TemplateCategory.UTILITY,
        language: 'en_US',
        status: TemplateStatus.APPROVED,
        body: {
          type: 'body',
          text: 'Your order {{1}} has been shipped! Track it here: {{2}}',
        },
        totalSent: 89,
        approvedAt: new Date(),
      },
    }),
    prisma.template.upsert({
      where: { metaTemplateId: 'demo_template_promo' },
      update: {},
      create: {
        tenantId: demoTenant.id,
        metaTemplateId: 'demo_template_promo',
        name: 'promotional_offer',
        category: TemplateCategory.MARKETING,
        language: 'en_US',
        status: TemplateStatus.PENDING,
        body: {
          type: 'body',
          text: '🎉 {{1}}% off everything! Use code {{2}} at checkout. Limited time only!',
        },
        submittedAt: new Date(),
      },
    }),
  ]);

  console.log(`✅ Created ${templates.length} templates\n`);

  // ============================================
  // Create Tags
  // ============================================
  console.log('🏷️ Creating tags...');

  const tags = await Promise.all([
    prisma.tag.upsert({
      where: { tenantId_name: { tenantId: demoTenant.id, name: 'VIP' } },
      update: {},
      create: { tenantId: demoTenant.id, name: 'VIP', color: '#FFD700', type: 'system' },
    }),
    prisma.tag.upsert({
      where: { tenantId_name: { tenantId: demoTenant.id, name: 'Support' } },
      update: {},
      create: { tenantId: demoTenant.id, name: 'Support', color: '#3B82F6', type: 'general' },
    }),
    prisma.tag.upsert({
      where: { tenantId_name: { tenantId: demoTenant.id, name: 'Sales' } },
      update: {},
      create: { tenantId: demoTenant.id, name: 'Sales', color: '#10B981', type: 'general' },
    }),
  ]);

  console.log(`✅ Created ${tags.length} tags\n`);

  // ============================================
  // Create Support Tickets
  // ============================================
  console.log('🎫 Creating support tickets...');

  const tickets = await Promise.all([
    prisma.ticket.create({
      data: {
        tenantId: demoTenant.id,
        subject: 'Unable to send campaign',
        description: 'When I try to send a campaign to my segment, I get an error message.',
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        category: 'Technical',
        assignedToId: users[2].id,
      },
    }),
    prisma.ticket.create({
      data: {
        tenantId: demoTenant.id,
        subject: 'Feature request: Dark mode',
        description: 'Would love to have a dark mode option for the dashboard.',
        priority: TicketPriority.LOW,
        status: TicketStatus.IN_PROGRESS,
        category: 'Feature Request',
      },
    }),
  ]);

  console.log(`✅ Created ${tickets.length} tickets\n`);

  // ============================================
  // Create Segments
  // ============================================
  console.log('📊 Creating segments...');

  const segments = await Promise.all([
    prisma.segment.upsert({
      where: { tenantId_name: { tenantId: demoTenant.id, name: 'Active Contacts' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        name: 'Active Contacts',
        description: 'Contacts who messaged in the last 30 days',
        query: {
          conditions: [
            { field: 'lastMessageAt', operator: 'gte', value: '30 days ago' },
          ],
        },
        queryHash: 'active-contacts-v1',
        totalContacts: 125,
      },
    }),
    prisma.segment.upsert({
      where: { tenantId_name: { tenantId: demoTenant.id, name: 'VIP Customers' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        name: 'VIP Customers',
        description: 'High-value customers marked as VIP',
        query: {
          conditions: [
            { field: 'tags', operator: 'contains', value: 'VIP' },
          ],
        },
        queryHash: 'vip-customers-v1',
        totalContacts: 45,
      },
    }),
  ]);

  console.log(`✅ Created ${segments.length} segments\n`);

  // ============================================
  // Create Additional Tenants for Superadmin Demo
  // ============================================
  console.log('🏢 Creating additional tenants for demo...');

  const additionalTenants = await Promise.all([
    prisma.tenant.create({
      data: {
        name: 'TechStart Inc',
        website: 'https://techstart.io',
        timezone: 'America/Los_Angeles',
        industry: 'SaaS',
        status: TenantStatus.ACTIVE,
        planId: plans[0].id, // Starter
        isOnTrial: true,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        currentContacts: 150,
        currentMessages: 1200,
        billingEmail: 'admin@techstart.io',
        qualityScore: 'GREEN',
      },
    }),
    prisma.tenant.create({
      data: {
        name: 'Global Retail Ltd',
        website: 'https://globalretail.com',
        timezone: 'Europe/London',
        industry: 'Retail',
        status: TenantStatus.ACTIVE,
        planId: plans[2].id, // Business
        currentContacts: 8500,
        currentMessages: 78000,
        billingEmail: 'finance@globalretail.com',
        qualityScore: 'YELLOW',
      },
    }),
    prisma.tenant.create({
      data: {
        name: 'StartupXYZ',
        website: 'https://startupxyz.com',
        timezone: 'Asia/Singapore',
        industry: 'Fintech',
        status: TenantStatus.SUSPENDED,
        planId: plans[1].id, // Growth
        suspendedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        currentContacts: 800,
        currentMessages: 15000,
        billingEmail: 'billing@startupxyz.com',
        qualityScore: 'RED',
      },
    }),
  ]);

  console.log(`✅ Created ${additionalTenants.length} additional tenants\n`);

  // ============================================
  // Create Audit Logs
  // ============================================
  console.log('📜 Creating audit logs...');

  const auditLogs = await Promise.all([
    prisma.auditLog.create({
      data: {
        tenantId: demoTenant.id,
        actorId: users[0].id,
        actorType: 'user',
        actorRole: UserRole.OWNER,
        action: 'LOGIN',
        resource: 'auth',
        userId: users[0].id,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: demoTenant.id,
        actorId: users[0].id,
        actorType: 'user',
        actorRole: UserRole.OWNER,
        action: 'SEND_MESSAGE',
        resource: 'messages',
        metadata: { contactId: contacts[0].id },
        userId: users[0].id,
        ipAddress: '192.168.1.100',
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: demoTenant.id,
        actorId: users[2].id,
        actorType: 'user',
        actorRole: UserRole.MANAGER,
        action: 'CREATE',
        resource: 'campaigns',
        resourceId: 'campaign-1',
        userId: users[2].id,
        ipAddress: '192.168.1.101',
      },
    }),
  ]);

  console.log(`✅ Created ${auditLogs.length} audit logs\n`);

  // ============================================
  // Summary
  // ============================================
  console.log('='.repeat(50));
  console.log('🎉 Database seeding completed successfully!');
  console.log('='.repeat(50));
  console.log('\n📋 Demo Credentials:');
  console.log('\n🔐 Super Admin:');
  console.log('   Email: admin@whatsapp-saas.com');
  console.log('   Password: admin123');
  console.log('\n👤 Demo Tenant (Acme Corporation):');
  console.log('   Owner: owner@demo.com / demo123');
  console.log('   Admin: admin@demo.com / demo123');
  console.log('   Manager: manager@demo.com / demo123');
  console.log('   Agent: agent1@demo.com / demo123');
  console.log('\n💡 Note: In production, change these passwords immediately!');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
