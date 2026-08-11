// RBAC -- Role-Based Access Control System
// Multi-tenant permission matrix with superadmin bypass

// ============================================
// Types
// ============================================

export type Resource =
  | 'dashboard'
  | 'contacts'
  | 'conversations'
  | 'messages'
  | 'campaigns'
  | 'templates'
  | 'chatbot'
  | 'flows'
  | 'phone_numbers'
  | 'analytics'
  | 'team'
  | 'settings'
  | 'billing'
  | 'api_keys'
  | 'segments'
  | 'tickets'
  | 'audit_logs'
  | 'plans'
  | 'tenants'
  | 'support_tickets'
  | 'system_settings'
  | 'templates_management';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'send' | 'export';

export type UserRole =
  | 'SUPERADMIN'
  | 'SUPPORT_ADMIN'
  | 'FINANCE_ADMIN'
  | 'DEVELOPER'
  | 'OWNER'
  | 'ADMIN'
  | 'MANAGER'
  | 'AGENT'
  | 'VIEWER'
  | 'API_USER';

// ============================================
// Permission Matrix -- Tenant-Level Roles
// ============================================

export const TENANT_PERMISSIONS: Record<Resource, Record<Action, UserRole[]>> = {
  dashboard: {
    create: [],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER', 'API_USER'],
    update: [],
    delete: [],
    send: [],
    export: [],
  },
  contacts: {
    create: ['OWNER', 'ADMIN', 'MANAGER'],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER', 'API_USER'],
    update: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  conversations: {
    create: [],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER'],
    update: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
    delete: ['OWNER', 'ADMIN'],
    send: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  messages: {
    create: [],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER', 'API_USER'],
    update: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
    delete: ['OWNER', 'ADMIN'],
    send: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'API_USER'],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  campaigns: {
    create: ['OWNER', 'ADMIN', 'MANAGER'],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'],
    update: ['OWNER', 'ADMIN', 'MANAGER'],
    delete: ['OWNER', 'ADMIN'],
    send: ['OWNER', 'ADMIN', 'MANAGER'],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  templates: {
    create: ['OWNER', 'ADMIN', 'MANAGER'],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'],
    update: ['OWNER', 'ADMIN', 'MANAGER'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  chatbot: {
    create: ['OWNER', 'ADMIN', 'MANAGER'],
    read: ['OWNER', 'ADMIN', 'MANAGER'],
    update: ['OWNER', 'ADMIN', 'MANAGER'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  flows: {
    create: ['OWNER', 'ADMIN', 'MANAGER'],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'],
    update: ['OWNER', 'ADMIN', 'MANAGER'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  phone_numbers: {
    create: ['OWNER'],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'],
    update: ['OWNER', 'ADMIN'],
    delete: ['OWNER'],
    send: [],
    export: ['OWNER', 'ADMIN'],
  },
  analytics: {
    create: [],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'],
    update: [],
    delete: [],
    send: [],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  team: {
    create: ['OWNER', 'ADMIN'],
    read: ['OWNER', 'ADMIN', 'MANAGER'],
    update: ['OWNER', 'ADMIN', 'MANAGER'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN'],
  },
  settings: {
    create: [],
    read: ['OWNER', 'ADMIN'],
    update: ['OWNER', 'ADMIN'],
    delete: [],
    send: [],
    export: ['OWNER'],
  },
  billing: {
    create: [],
    read: ['OWNER'],
    update: ['OWNER'],
    delete: [],
    send: [],
    export: ['OWNER'],
  },
  api_keys: {
    create: ['OWNER', 'ADMIN'],
    read: ['OWNER', 'ADMIN'],
    update: ['OWNER', 'ADMIN'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN'],
  },
  segments: {
    create: ['OWNER', 'ADMIN', 'MANAGER'],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'],
    update: ['OWNER', 'ADMIN', 'MANAGER'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  tickets: {
    create: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
    read: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER'],
    update: ['OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
    delete: ['OWNER', 'ADMIN'],
    send: [],
    export: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  audit_logs: {
    create: [],
    read: ['OWNER', 'ADMIN'],
    update: [],
    delete: [],
    send: [],
    export: ['OWNER', 'ADMIN'],
  },
  // Platform-level (superadmin only)
  plans: {
    create: ['SUPERADMIN'],
    read: ['SUPERADMIN'],
    update: ['SUPERADMIN'],
    delete: ['SUPERADMIN'],
    send: [],
    export: ['SUPERADMIN'],
  },
  tenants: {
    create: ['SUPERADMIN'],
    read: ['SUPERADMIN'],
    update: ['SUPERADMIN'],
    delete: ['SUPERADMIN'],
    send: [],
    export: ['SUPERADMIN'],
  },
  support_tickets: {
    create: [],
    read: ['SUPERADMIN', 'SUPPORT_ADMIN'],
    update: ['SUPERADMIN', 'SUPPORT_ADMIN'],
    delete: ['SUPERADMIN'],
    send: [],
    export: ['SUPERADMIN', 'SUPPORT_ADMIN'],
  },
  system_settings: {
    create: ['SUPERADMIN'],
    read: ['SUPERADMIN'],
    update: ['SUPERADMIN'],
    delete: ['SUPERADMIN'],
    send: [],
    export: ['SUPERADMIN'],
  },
  templates_management: {
    create: ['SUPERADMIN'],
    read: ['SUPERADMIN', 'SUPPORT_ADMIN'],
    update: ['SUPERADMIN'],
    delete: ['SUPERADMIN'],
    send: [],
    export: ['SUPERADMIN'],
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a role has permission for a specific action on a resource
 */
export function hasPermission(
  role: string,
  resource: Resource,
  action: Action
): boolean {
  const allowedRoles = TENANT_PERMISSIONS[resource]?.[action];
  return allowedRoles?.includes(role as UserRole) ?? false;
}

/**
 * Check if a role is a superadmin platform role
 */
export function isSuperadminRole(role: string): boolean {
  return ['SUPERADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'DEVELOPER'].includes(role);
}

/**
 * Check if a role is an admin role (tenant level)
 */
export function isAdminRole(role: string): boolean {
  return ['OWNER', 'ADMIN'].includes(role);
}

/**
 * Get all permissions for a given role
 */
export function getPermissionsForRole(
  role: string
): { resource: Resource; actions: Action[] }[] {
  const result: { resource: Resource; actions: Action[] }[] = [];

  for (const [resource, actions] of Object.entries(TENANT_PERMISSIONS)) {
    const allowedActions: Action[] = [];
    for (const [action, roles] of Object.entries(actions)) {
      if (roles.includes(role as UserRole)) {
        allowedActions.push(action as Action);
      }
    }
    if (allowedActions.length > 0) {
      result.push({ resource: resource as Resource, actions: allowedActions });
    }
  }

  return result;
}

/**
 * Get all resources a role can access
 */
export function getAccessibleResources(role: string): Resource[] {
  const resources: Resource[] = [];

  for (const [resource, actions] of Object.entries(TENANT_PERMISSIONS)) {
    for (const [, roles] of Object.entries(actions)) {
      if (roles.includes(role as UserRole)) {
        if (!resources.includes(resource as Resource)) {
          resources.push(resource as Resource);
        }
        break;
      }
    }
  }

  return resources;
}

// ============================================
// Role Display Names & Descriptions
// ============================================

export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  SUPERADMIN: 'Super Admin',
  SUPPORT_ADMIN: 'Support Admin',
  FINANCE_ADMIN: 'Finance Admin',
  DEVELOPER: 'Developer',
  OWNER: 'Workspace Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  AGENT: 'Agent',
  VIEWER: 'Viewer',
  API_USER: 'API User',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPERADMIN: 'Full platform access -- system administration',
  SUPPORT_ADMIN: 'Support access -- help tenants but no billing or system changes',
  FINANCE_ADMIN: 'Billing and subscription management across all tenants',
  DEVELOPER: 'API and webhook management, no tenant user management',
  OWNER: 'Full workspace access including billing and team management',
  ADMIN: 'Full workspace access except billing cancellation',
  MANAGER: 'Manage team, campaigns, contacts, and analytics',
  AGENT: 'Reply to assigned conversations and view message history',
  VIEWER: 'Read-only access to dashboards and reports',
  API_USER: 'Programmatic API access only -- no dashboard access',
};

// ============================================
// Role Hierarchy
// ============================================

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  // Platform level (higher = more powerful)
  SUPERADMIN: 100,
  SUPPORT_ADMIN: 90,
  FINANCE_ADMIN: 85,
  DEVELOPER: 80,
  // Tenant level
  OWNER: 50,
  ADMIN: 40,
  MANAGER: 30,
  AGENT: 20,
  VIEWER: 10,
  API_USER: 5,
};

/**
 * Check if a role has higher or equal privilege than another
 */
export function hasRolePrivilege(role: string, requiredRole: string): boolean {
  const roleLevel = ROLE_HIERARCHY[role as UserRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole as UserRole] ?? 0;
  return roleLevel >= requiredLevel;
}
