// Shared Types for WhatsApp SaaS Platform

// ============================================
// Common Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedRequest {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// ============================================
// Auth Types
// ============================================

export interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  tenantId?: string;
  superadminId?: string;
  isSuperadmin: boolean;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserInfo;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  tenantName?: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
  avatarUrl?: string;
}

// ============================================
// Tenant Types
// ============================================

export interface TenantSummary {
  id: string;
  name: string;
  logoUrl?: string;
  status: string;
  planName: string;
  currentContacts: number;
  currentMessages: number;
  createdAt: string;
}

export interface CreateTenantRequest {
  name: string;
  email: string;
  password: string;
  planId: string;
  phone?: string;
  timezone?: string;
  industry?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  logoUrl?: string;
  website?: string;
  timezone?: string;
  billingEmail?: string;
  industry?: string;
  useCase?: string;
}

// ============================================
// Contact Types
// ============================================

export interface ContactSummary {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  lastMessageAt?: string;
  tags: string[];
}

export interface CreateContactRequest {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  city?: string;
  country?: string;
  language?: string;
  customFields?: Record<string, string>;
}

export interface ImportContactsRequest {
  contacts: CreateContactRequest[];
  duplicateHandling?: 'skip' | 'update' | 'error';
}

// ============================================
// Conversation Types
// ============================================

export interface ConversationSummary {
  id: string;
  contact: {
    id: string;
    name: string;
    phone: string;
  };
  phoneNumber: {
    id: string;
    displayName: string;
  };
  status: string;
  assignedTo?: {
    id: string;
    name: string;
  };
  lastMessage?: {
    body: string;
    direction: string;
    timestamp: string;
  };
  unreadCount: number;
}

export interface MessageSummary {
  id: string;
  direction: 'INCOMING' | 'OUTGOING';
  type: string;
  body?: string;
  status: string;
  timestamp: string;
  sender?: {
    id: string;
    name: string;
  };
  mediaUrl?: string;
}

export interface SendMessageRequest {
  conversationId?: string;
  contactId: string;
  phoneNumberId: string;
  type: 'text' | 'template';
  body?: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  mediaUrl?: string;
  mediaCaption?: string;
}

// ============================================
// Campaign Types
// ============================================

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  templateName?: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  scheduledAt?: string;
  createdAt: string;
}

export interface CreateCampaignRequest {
  name: string;
  templateId: string;
  phoneNumberId: string;
  audienceType: 'segment' | 'contacts';
  segmentIds?: string[];
  contactIds?: string[];
  scheduledAt?: string;
  variableMappings?: Record<string, string>;
}

// ============================================
// Analytics Types
// ============================================

export interface DashboardMetrics {
  totalContacts: number;
  totalConversations: number;
  openConversations: number;
  messagesThisMonth: number;
  activeAgents: number;
  avgResponseTime: number;
  deliveryRate: number;
  readRate: number;
}

export interface MessageAnalytics {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface ConversationAnalytics {
  date: string;
  opened: number;
  closed: number;
  pending: number;
}

// ============================================
// Template Types
// ============================================

export interface TemplateSummary {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  totalSent: number;
  lastSentAt?: string;
}

export interface CreateTemplateRequest {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    mediaUrl?: string;
  };
  body: {
    text: string;
  };
  footer?: string;
  buttons?: {
    type: 'url' | 'quick_reply';
    text: string;
    url?: string;
    payload?: string;
  }[];
}

// ============================================
// Bot Flow Types
// ============================================

export interface BotFlowSummary {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  isDefault: boolean;
  totalTriggered: number;
  totalResolved: number;
}

export interface CreateBotFlowRequest {
  name: string;
  description?: string;
  flowData: BotFlowNode[];
  phoneNumberIds: string[];
  fallbackMessage?: string;
  businessHoursMode?: boolean;
  offHoursMessage?: string;
}

export interface BotFlowNode {
  id: string;
  type: 'trigger' | 'message' | 'question' | 'condition' | 'action' | 'end';
  data: Record<string, unknown>;
  next?: string[];
}

// ============================================
// Billing Types
// ============================================

export interface BillingInfo {
  plan: {
    id: string;
    name: string;
    price: number;
    interval: 'monthly' | 'annual';
  };
  usage: {
    contacts: { current: number; limit: number };
    messages: { current: number; limit: number };
  };
  addons: {
    id: string;
    name: string;
    price: number;
  }[];
  nextBillingDate: string;
  paymentMethod?: {
    type: string;
    last4: string;
    expiry: string;
  };
}

export interface InvoiceSummary {
  id: string;
  number: string;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt?: string;
  dueDate: string;
}

// ============================================
// Support Types
// ============================================

export interface TicketSummary {
  id: string;
  subject: string;
  priority: string;
  status: string;
  category?: string;
  tenantName?: string;
  assignedTo?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketRequest {
  subject: string;
  description: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category?: string;
  tenantId?: string;
}

// ============================================
// Audit Types
// ============================================

export interface AuditLogEntry {
  id: string;
  actor: {
    id: string;
    name: string;
    type: 'user' | 'superadmin' | 'system';
  };
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// ============================================
// Webhook Types
// ============================================

export interface WhatsAppWebhookEvent {
  type: 'messages' | 'message_delivery' | 'message_read' | 'message_ack' | 'error';
  phoneNumberId: string;
  messageId?: string;
  from?: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface StripeWebhookEvent {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}
