// API ROUTE BLUEPRINTS -- Fastify
// 60+ routes: superadmin + tenant + public

// ============================================
// Types
// ============================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  auth: 'public' | 'user' | 'superadmin';
  rbac?: {
    resource: string;
    action: string;
  };
  description: string;
}

export interface RouteGroup {
  name: string;
  description: string;
  routes: RouteDefinition[];
}

// ============================================
// Superadmin Routes
// ============================================

const superadminRoutes: RouteDefinition[] = [
  // Dashboard
  { method: 'GET', path: '/api/v1/superadmin/dashboard', auth: 'superadmin', description: 'Get superadmin dashboard metrics' },

  // Tenant Management
  { method: 'GET', path: '/api/v1/superadmin/tenants', auth: 'superadmin', description: 'List all tenants' },
  { method: 'POST', path: '/api/v1/superadmin/tenants', auth: 'superadmin', description: 'Create new tenant' },
  { method: 'GET', path: '/api/v1/superadmin/tenants/:tenantId', auth: 'superadmin', description: 'Get tenant details' },
  { method: 'PATCH', path: '/api/v1/superadmin/tenants/:tenantId', auth: 'superadmin', description: 'Update tenant' },
  { method: 'POST', path: '/api/v1/superadmin/tenants/:tenantId/suspend', auth: 'superadmin', description: 'Suspend tenant' },
  { method: 'POST', path: '/api/v1/superadmin/tenants/:tenantId/reactivate', auth: 'superadmin', description: 'Reactivate tenant' },
  { method: 'DELETE', path: '/api/v1/superadmin/tenants/:tenantId', auth: 'superadmin', description: 'Delete tenant' },

  // Plans Management
  { method: 'GET', path: '/api/v1/superadmin/plans', auth: 'superadmin', description: 'List all plans' },
  { method: 'POST', path: '/api/v1/superadmin/plans', auth: 'superadmin', description: 'Create plan' },
  { method: 'PATCH', path: '/api/v1/superadmin/plans/:planId', auth: 'superadmin', description: 'Update plan' },
  { method: 'DELETE', path: '/api/v1/superadmin/plans/:planId', auth: 'superadmin', description: 'Delete plan' },

  // Phone Numbers
  { method: 'GET', path: '/api/v1/superadmin/phone-numbers', auth: 'superadmin', description: 'List all phone numbers' },
  { method: 'POST', path: '/api/v1/superadmin/phone-numbers/assign', auth: 'superadmin', description: 'Assign phone number to tenant' },

  // Support Tickets
  { method: 'GET', path: '/api/v1/superadmin/tickets', auth: 'superadmin', description: 'List all support tickets' },
  { method: 'GET', path: '/api/v1/superadmin/tickets/:ticketId', auth: 'superadmin', description: 'Get ticket details' },
  { method: 'PATCH', path: '/api/v1/superadmin/tickets/:ticketId', auth: 'superadmin', description: 'Update ticket' },
  { method: 'POST', path: '/api/v1/superadmin/tickets/:ticketId/reply', auth: 'superadmin', description: 'Reply to ticket' },

  // Billing
  { method: 'GET', path: '/api/v1/superadmin/billing', auth: 'superadmin', description: 'Get platform billing overview' },
  { method: 'GET', path: '/api/v1/superadmin/billing/tenants/:tenantId', auth: 'superadmin', description: 'Get tenant billing details' },
  { method: 'POST', path: '/api/v1/superadmin/billing/tenants/:tenantId/invoice', auth: 'superadmin', description: 'Generate invoice for tenant' },

  // Audit Logs
  { method: 'GET', path: '/api/v1/superadmin/audit-logs', auth: 'superadmin', description: 'Get platform audit logs' },

  // Settings
  { method: 'GET', path: '/api/v1/superadmin/settings', auth: 'superadmin', description: 'Get platform settings' },
  { method: 'PATCH', path: '/api/v1/superadmin/settings', auth: 'superadmin', description: 'Update platform settings' },
];

// ============================================
// Tenant Routes
// ============================================

const tenantRoutes: RouteDefinition[] = [
  // Auth
  { method: 'POST', path: '/api/v1/auth/register', auth: 'public', description: 'Register new user' },
  { method: 'POST', path: '/api/v1/auth/login', auth: 'public', description: 'User login' },
  { method: 'POST', path: '/api/v1/auth/refresh', auth: 'public', description: 'Refresh access token' },
  { method: 'POST', path: '/api/v1/auth/logout', auth: 'user', description: 'User logout' },
  { method: 'POST', path: '/api/v1/auth/forgot-password', auth: 'public', description: 'Request password reset' },
  { method: 'POST', path: '/api/v1/auth/reset-password', auth: 'public', description: 'Reset password with token' },

  // Dashboard
  { method: 'GET', path: '/api/v1/dashboard', auth: 'user', rbac: { resource: 'dashboard', action: 'read' }, description: 'Get dashboard metrics' },

  // Contacts
  { method: 'GET', path: '/api/v1/contacts', auth: 'user', rbac: { resource: 'contacts', action: 'read' }, description: 'List contacts' },
  { method: 'POST', path: '/api/v1/contacts', auth: 'user', rbac: { resource: 'contacts', action: 'create' }, description: 'Create contact' },
  { method: 'POST', path: '/api/v1/contacts/import', auth: 'user', rbac: { resource: 'contacts', action: 'create' }, description: 'Import contacts' },
  { method: 'GET', path: '/api/v1/contacts/:contactId', auth: 'user', rbac: { resource: 'contacts', action: 'read' }, description: 'Get contact details' },
  { method: 'PATCH', path: '/api/v1/contacts/:contactId', auth: 'user', rbac: { resource: 'contacts', action: 'update' }, description: 'Update contact' },
  { method: 'DELETE', path: '/api/v1/contacts/:contactId', auth: 'user', rbac: { resource: 'contacts', action: 'delete' }, description: 'Delete contact' },
  { method: 'POST', path: '/api/v1/contacts/:contactId/opt-out', auth: 'user', rbac: { resource: 'contacts', action: 'update' }, description: 'Opt out contact' },
  { method: 'GET', path: '/api/v1/contacts/:contactId/conversations', auth: 'user', rbac: { resource: 'conversations', action: 'read' }, description: 'Get contact conversations' },

  // Segments
  { method: 'GET', path: '/api/v1/segments', auth: 'user', rbac: { resource: 'segments', action: 'read' }, description: 'List segments' },
  { method: 'POST', path: '/api/v1/segments', auth: 'user', rbac: { resource: 'segments', action: 'create' }, description: 'Create segment' },
  { method: 'GET', path: '/api/v1/segments/:segmentId/preview', auth: 'user', rbac: { resource: 'segments', action: 'read' }, description: 'Preview segment contacts' },

  // Conversations
  { method: 'GET', path: '/api/v1/conversations', auth: 'user', rbac: { resource: 'conversations', action: 'read' }, description: 'List conversations' },
  { method: 'GET', path: '/api/v1/conversations/:conversationId', auth: 'user', rbac: { resource: 'conversations', action: 'read' }, description: 'Get conversation details' },
  { method: 'PATCH', path: '/api/v1/conversations/:conversationId', auth: 'user', rbac: { resource: 'conversations', action: 'update' }, description: 'Update conversation' },
  { method: 'POST', path: '/api/v1/conversations/:conversationId/close', auth: 'user', rbac: { resource: 'conversations', action: 'update' }, description: 'Close conversation' },
  { method: 'POST', path: '/api/v1/conversations/:conversationId/reopen', auth: 'user', rbac: { resource: 'conversations', action: 'update' }, description: 'Reopen conversation' },
  { method: 'POST', path: '/api/v1/conversations/:conversationId/assign', auth: 'user', rbac: { resource: 'conversations', action: 'update' }, description: 'Assign conversation' },

  // Messages
  { method: 'POST', path: '/api/v1/messages/send', auth: 'user', rbac: { resource: 'messages', action: 'send' }, description: 'Send message' },
  { method: 'POST', path: '/api/v1/messages/send-template', auth: 'user', rbac: { resource: 'messages', action: 'send' }, description: 'Send template message' },
  { method: 'POST', path: '/api/v1/messages/:messageId/read', auth: 'user', rbac: { resource: 'messages', action: 'update' }, description: 'Mark message as read' },

  // Campaigns
  { method: 'GET', path: '/api/v1/campaigns', auth: 'user', rbac: { resource: 'campaigns', action: 'read' }, description: 'List campaigns' },
  { method: 'POST', path: '/api/v1/campaigns', auth: 'user', rbac: { resource: 'campaigns', action: 'create' }, description: 'Create campaign' },
  { method: 'GET', path: '/api/v1/campaigns/:campaignId', auth: 'user', rbac: { resource: 'campaigns', action: 'read' }, description: 'Get campaign details' },
  { method: 'POST', path: '/api/v1/campaigns/:campaignId/send', auth: 'user', rbac: { resource: 'campaigns', action: 'send' }, description: 'Send campaign' },
  { method: 'POST', path: '/api/v1/campaigns/:campaignId/schedule', auth: 'user', rbac: { resource: 'campaigns', action: 'create' }, description: 'Schedule campaign' },
  { method: 'POST', path: '/api/v1/campaigns/:campaignId/cancel', auth: 'user', rbac: { resource: 'campaigns', action: 'update' }, description: 'Cancel campaign' },
  { method: 'GET', path: '/api/v1/campaigns/:campaignId/stats', auth: 'user', rbac: { resource: 'campaigns', action: 'read' }, description: 'Get campaign stats' },

  // Templates
  { method: 'GET', path: '/api/v1/templates', auth: 'user', rbac: { resource: 'templates', action: 'read' }, description: 'List templates' },
  { method: 'POST', path: '/api/v1/templates', auth: 'user', rbac: { resource: 'templates', action: 'create' }, description: 'Create template' },
  { method: 'GET', path: '/api/v1/templates/:templateId', auth: 'user', rbac: { resource: 'templates', action: 'read' }, description: 'Get template details' },
  { method: 'POST', path: '/api/v1/templates/:templateId/submit', auth: 'user', rbac: { resource: 'templates', action: 'create' }, description: 'Submit template for approval' },
  { method: 'PATCH', path: '/api/v1/templates/:templateId', auth: 'user', rbac: { resource: 'templates', action: 'update' }, description: 'Update template' },
  { method: 'DELETE', path: '/api/v1/templates/:templateId', auth: 'user', rbac: { resource: 'templates', action: 'delete' }, description: 'Delete template' },

  // Chatbot Flows
  { method: 'GET', path: '/api/v1/chatbot/flows', auth: 'user', rbac: { resource: 'chatbot', action: 'read' }, description: 'List chatbot flows' },
  { method: 'POST', path: '/api/v1/chatbot/flows', auth: 'user', rbac: { resource: 'chatbot', action: 'create' }, description: 'Create chatbot flow' },
  { method: 'GET', path: '/api/v1/chatbot/flows/:flowId', auth: 'user', rbac: { resource: 'chatbot', action: 'read' }, description: 'Get flow details' },
  { method: 'PATCH', path: '/api/v1/chatbot/flows/:flowId', auth: 'user', rbac: { resource: 'chatbot', action: 'update' }, description: 'Update chatbot flow' },
  { method: 'POST', path: '/api/v1/chatbot/flows/:flowId/activate', auth: 'user', rbac: { resource: 'chatbot', action: 'update' }, description: 'Activate chatbot flow' },
  { method: 'POST', path: '/api/v1/chatbot/flows/:flowId/deactivate', auth: 'user', rbac: { resource: 'chatbot', action: 'update' }, description: 'Deactivate chatbot flow' },

  // WhatsApp Flows
  { method: 'GET', path: '/api/v1/flows', auth: 'user', rbac: { resource: 'flows', action: 'read' }, description: 'List WhatsApp flows' },
  { method: 'POST', path: '/api/v1/flows', auth: 'user', rbac: { resource: 'flows', action: 'create' }, description: 'Create WhatsApp flow' },
  { method: 'POST', path: '/api/v1/flows/:flowId/test', auth: 'user', rbac: { resource: 'flows', action: 'create' }, description: 'Test WhatsApp flow' },

  // Phone Numbers
  { method: 'GET', path: '/api/v1/phone-numbers', auth: 'user', rbac: { resource: 'phone_numbers', action: 'read' }, description: 'List phone numbers' },
  { method: 'POST', path: '/api/v1/phone-numbers', auth: 'user', rbac: { resource: 'phone_numbers', action: 'create' }, description: 'Add phone number' },
  { method: 'GET', path: '/api/v1/phone-numbers/:phoneNumberId', auth: 'user', rbac: { resource: 'phone_numbers', action: 'read' }, description: 'Get phone number details' },
  { method: 'PATCH', path: '/api/v1/phone-numbers/:phoneNumberId', auth: 'user', rbac: { resource: 'phone_numbers', action: 'update' }, description: 'Update phone number' },

  // Team
  { method: 'GET', path: '/api/v1/team', auth: 'user', rbac: { resource: 'team', action: 'read' }, description: 'List team members' },
  { method: 'POST', path: '/api/v1/team/invite', auth: 'user', rbac: { resource: 'team', action: 'create' }, description: 'Invite team member' },
  { method: 'GET', path: '/api/v1/team/:userId', auth: 'user', rbac: { resource: 'team', action: 'read' }, description: 'Get team member details' },
  { method: 'PATCH', path: '/api/v1/team/:userId', auth: 'user', rbac: { resource: 'team', action: 'update' }, description: 'Update team member' },
  { method: 'POST', path: '/api/v1/team/:userId/deactivate', auth: 'user', rbac: { resource: 'team', action: 'update' }, description: 'Deactivate team member' },

  // API Keys
  { method: 'GET', path: '/api/v1/api-keys', auth: 'user', rbac: { resource: 'api_keys', action: 'read' }, description: 'List API keys' },
  { method: 'POST', path: '/api/v1/api-keys', auth: 'user', rbac: { resource: 'api_keys', action: 'create' }, description: 'Create API key' },
  { method: 'DELETE', path: '/api/v1/api-keys/:apiKeyId', auth: 'user', rbac: { resource: 'api_keys', action: 'delete' }, description: 'Delete API key' },

  // Analytics
  { method: 'GET', path: '/api/v1/analytics/overview', auth: 'user', rbac: { resource: 'analytics', action: 'read' }, description: 'Get analytics overview' },
  { method: 'GET', path: '/api/v1/analytics/messages', auth: 'user', rbac: { resource: 'analytics', action: 'read' }, description: 'Get message analytics' },
  { method: 'GET', path: '/api/v1/analytics/campaigns', auth: 'user', rbac: { resource: 'analytics', action: 'read' }, description: 'Get campaign analytics' },
  { method: 'GET', path: '/api/v1/analytics/agents', auth: 'user', rbac: { resource: 'analytics', action: 'read' }, description: 'Get agent performance' },
  { method: 'GET', path: '/api/v1/analytics/export', auth: 'user', rbac: { resource: 'analytics', action: 'export' }, description: 'Export analytics data' },

  // Billing
  { method: 'GET', path: '/api/v1/billing', auth: 'user', rbac: { resource: 'billing', action: 'read' }, description: 'Get billing info' },
  { method: 'GET', path: '/api/v1/billing/invoices', auth: 'user', rbac: { resource: 'billing', action: 'read' }, description: 'List invoices' },
  { method: 'POST', path: '/api/v1/billing/upgrade', auth: 'user', rbac: { resource: 'billing', action: 'update' }, description: 'Upgrade plan' },
  { method: 'POST', path: '/api/v1/billing/downgrade', auth: 'user', rbac: { resource: 'billing', action: 'update' }, description: 'Downgrade plan' },

  // Settings
  { method: 'GET', path: '/api/v1/settings', auth: 'user', rbac: { resource: 'settings', action: 'read' }, description: 'Get workspace settings' },
  { method: 'PATCH', path: '/api/v1/settings', auth: 'user', rbac: { resource: 'settings', action: 'update' }, description: 'Update workspace settings' },

  // Tags
  { method: 'GET', path: '/api/v1/tags', auth: 'user', description: 'List tags' },
  { method: 'POST', path: '/api/v1/tags', auth: 'user', description: 'Create tag' },
  { method: 'PATCH', path: '/api/v1/tags/:tagId', auth: 'user', description: 'Update tag' },
  { method: 'DELETE', path: '/api/v1/tags/:tagId', auth: 'user', description: 'Delete tag' },

  // Tickets
  { method: 'GET', path: '/api/v1/tickets', auth: 'user', rbac: { resource: 'tickets', action: 'read' }, description: 'List support tickets' },
  { method: 'POST', path: '/api/v1/tickets', auth: 'user', rbac: { resource: 'tickets', action: 'create' }, description: 'Create support ticket' },
  { method: 'GET', path: '/api/v1/tickets/:ticketId', auth: 'user', rbac: { resource: 'tickets', action: 'read' }, description: 'Get ticket details' },
  { method: 'POST', path: '/api/v1/tickets/:ticketId/reply', auth: 'user', rbac: { resource: 'tickets', action: 'update' }, description: 'Reply to ticket' },
];

// ============================================
// Public Routes (Webhooks)
// ============================================

const publicRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/health', auth: 'public', description: 'Health check' },
  { method: 'GET', path: '/api/v1/plans', auth: 'public', description: 'Get public pricing plans' },
  { method: 'POST', path: '/api/v1/webhooks/whatsapp', auth: 'public', description: 'WhatsApp webhook' },
  { method: 'POST', path: '/api/v1/stripe/webhook', auth: 'public', description: 'Stripe webhook' },
];

// ============================================
// All Routes Grouped
// ============================================

export const ROUTE_GROUPS: RouteGroup[] = [
  { name: 'Superadmin', description: 'Platform administration routes', routes: superadminRoutes },
  { name: 'Tenant', description: 'Tenant workspace routes', routes: tenantRoutes },
  { name: 'Public', description: 'Public webhooks and endpoints', routes: publicRoutes },
];

// ============================================
// Flatten all routes
// ============================================

export const ALL_ROUTES: RouteDefinition[] = [
  ...superadminRoutes,
  ...tenantRoutes,
  ...publicRoutes,
];

// ============================================
// Route Count Summary
// ============================================

export const ROUTE_SUMMARY = {
  superadmin: superadminRoutes.length,
  tenant: tenantRoutes.length,
  public: publicRoutes.length,
  total: ALL_ROUTES.length,
};

// ============================================
// Helper Functions
// ============================================

/**
 * Find route definition by method and path
 */
export function findRoute(method: HttpMethod, path: string): RouteDefinition | undefined {
  return ALL_ROUTES.find((route) => {
    const routePattern = route.path.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${routePattern}$`);
    return route.method === method && regex.test(path);
  });
}

/**
 * Get routes that require specific auth type
 */
export function getRoutesByAuth(auth: 'public' | 'user' | 'superadmin'): RouteDefinition[] {
  return ALL_ROUTES.filter((route) => route.auth === auth);
}

/**
 * Get routes that require specific RBAC resource
 */
export function getRoutesByResource(resource: string): RouteDefinition[] {
  return ALL_ROUTES.filter((route) => route.rbac?.resource === resource);
}
