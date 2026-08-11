/**
 * Request Validation Schemas
 * Comprehensive Zod schemas for API request validation
 */
import { z } from 'zod';
// ============================================
// AUTH SCHEMAS
// ============================================
export const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});
export const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});
export const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email format'),
});
export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});
// ============================================
// CONTACT SCHEMAS
// ============================================
export const createContactSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    phone: z.string().min(1, 'Phone is required').max(50),
    email: z.string().email().optional().or(z.literal('')),
    company: z.string().max(200).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    attributes: z.record(z.string()).optional(),
});
export const updateContactSchema = createContactSchema.partial();
export const importContactsSchema = z.object({
    contacts: z.array(createContactSchema).min(1).max(10000),
    duplicateHandling: z.enum(['skip', 'update', 'error']).default('skip'),
});
// ============================================
// CAMPAIGN SCHEMAS
// ============================================
export const createCampaignSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    templateId: z.string().optional(),
    phoneNumberId: z.string().optional(),
    audienceType: z.enum(['all', 'segment', 'contacts']),
    segmentIds: z.array(z.string()).optional(),
    contactIds: z.array(z.string()).max(10000).optional(),
    scheduledAt: z.string().datetime().optional(),
    message: z.string().max(4096).optional(),
});
export const updateCampaignSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    status: z.enum(['draft', 'scheduled', 'paused']).optional(),
});
// ============================================
// TEMPLATE SCHEMAS
// ============================================
export const createTemplateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
    language: z.string().default('en'),
    body: z.string().min(1, 'Body is required').max(1024),
    headerType: z.enum(['none', 'text', 'image', 'video', 'document']).default('none'),
    headerText: z.string().max(60).optional(),
    headerMediaUrl: z.string().url().optional(),
    footerText: z.string().max(60).optional(),
    buttons: z.array(z.object({
        type: z.enum(['quick_reply', 'url', 'phone']),
        text: z.string().min(1).max(25),
        url: z.string().url().optional(),
        phone: z.string().optional(),
    })).max(3).optional(),
});
// ============================================
// SEGMENT SCHEMAS
// ============================================
export const segmentConditionSchema = z.object({
    field: z.enum(['tags', 'city', 'country', 'lastMessageAt', 'createdAt', 'messagesSent', 'language', 'company']),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'gt', 'lt', 'within_days']),
    value: z.union([z.string(), z.number()]).optional(),
});
export const createSegmentSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    description: z.string().max(500).optional(),
    conditions: z.array(segmentConditionSchema).min(1).max(10),
    matchType: z.enum(['ALL', 'ANY']).default('ALL'),
});
// ============================================
// BILLING SCHEMAS
// ============================================
export const checkoutSchema = z.object({
    planTier: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
    interval: z.enum(['monthly', 'annual']).default('monthly'),
});
export const updatePlanSchema = z.object({
    planTier: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
    interval: z.enum(['monthly', 'annual']).default('monthly'),
});
// ============================================
// CREDITS SCHEMAS
// ============================================
export const purchaseCreditsSchema = z.object({
    packId: z.string().optional(),
    credits: z.number().int().positive().max(1000000).optional(),
    paymentMethodId: z.string().optional(),
    currency: z.string().length(3).default('USD'),
}).refine(data => data.packId || data.credits, {
    message: 'Either packId or credits must be provided',
});
// ============================================
// TEAM SCHEMAS
// ============================================
export const inviteMemberSchema = z.object({
    email: z.string().email('Invalid email format'),
    role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'VIEWER']),
    maxChats: z.number().int().positive().default(5),
});
export const updateMemberSchema = z.object({
    role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'VIEWER']).optional(),
    maxChats: z.number().int().positive().optional(),
    status: z.enum(['active', 'suspended']).optional(),
});
// ============================================
// WHATSAPP SCHEMAS
// ============================================
export const registerPhoneSchema = z.object({
    displayName: z.string().min(1, 'Display name is required').max(100),
    phoneNumber: z.string().min(1, 'Phone number is required').max(20),
    timezone: z.string().default('UTC'),
});
export const updateWebhookSchema = z.object({
    url: z.string().url('Invalid webhook URL'),
    enabledEvents: z.array(z.string()).optional(),
});
// ============================================
// SETTINGS SCHEMAS
// ============================================
export const updateProfileSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    phone: z.string().max(20).optional(),
    timezone: z.string().optional(),
    language: z.string().max(10).optional(),
    avatarUrl: z.string().url().optional(),
});
export const updateNotificationsSchema = z.object({
    newMessageNotifications: z.boolean().optional(),
    deliveryReports: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    billingAlerts: z.boolean().optional(),
    browserNotifications: z.boolean().optional(),
    smsAlerts: z.boolean().optional(),
});
// ============================================
// PAGINATION & FILTERING
// ============================================
export const paginationSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
});
export const dateRangeSchema = z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    period: z.enum(['7d', '30d', '90d']).optional(),
});
//# sourceMappingURL=validation.js.map