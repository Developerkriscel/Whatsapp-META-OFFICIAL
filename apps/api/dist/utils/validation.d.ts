/**
 * Request Validation Schemas
 * Comprehensive Zod schemas for API request validation
 */
import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const registerSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    confirmPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    name: string;
    password: string;
    confirmPassword: string;
}, {
    email: string;
    name: string;
    password: string;
    confirmPassword: string;
}>, {
    email: string;
    name: string;
    password: string;
    confirmPassword: string;
}, {
    email: string;
    name: string;
    password: string;
    confirmPassword: string;
}>;
export declare const forgotPasswordSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    token: string;
}, {
    password: string;
    token: string;
}>;
export declare const createContactSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
    email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    company: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    phone: string;
    email?: string | undefined;
    tags?: string[] | undefined;
    company?: string | undefined;
    attributes?: Record<string, string> | undefined;
}, {
    name: string;
    phone: string;
    email?: string | undefined;
    tags?: string[] | undefined;
    company?: string | undefined;
    attributes?: Record<string, string> | undefined;
}>;
export declare const updateContactSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    company: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    tags: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    attributes: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    name?: string | undefined;
    tags?: string[] | undefined;
    phone?: string | undefined;
    company?: string | undefined;
    attributes?: Record<string, string> | undefined;
}, {
    email?: string | undefined;
    name?: string | undefined;
    tags?: string[] | undefined;
    phone?: string | undefined;
    company?: string | undefined;
    attributes?: Record<string, string> | undefined;
}>;
export declare const importContactsSchema: z.ZodObject<{
    contacts: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
        company: z.ZodOptional<z.ZodString>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        phone: string;
        email?: string | undefined;
        tags?: string[] | undefined;
        company?: string | undefined;
        attributes?: Record<string, string> | undefined;
    }, {
        name: string;
        phone: string;
        email?: string | undefined;
        tags?: string[] | undefined;
        company?: string | undefined;
        attributes?: Record<string, string> | undefined;
    }>, "many">;
    duplicateHandling: z.ZodDefault<z.ZodEnum<["skip", "update", "error"]>>;
}, "strip", z.ZodTypeAny, {
    contacts: {
        name: string;
        phone: string;
        email?: string | undefined;
        tags?: string[] | undefined;
        company?: string | undefined;
        attributes?: Record<string, string> | undefined;
    }[];
    duplicateHandling: "update" | "error" | "skip";
}, {
    contacts: {
        name: string;
        phone: string;
        email?: string | undefined;
        tags?: string[] | undefined;
        company?: string | undefined;
        attributes?: Record<string, string> | undefined;
    }[];
    duplicateHandling?: "update" | "error" | "skip" | undefined;
}>;
export declare const createCampaignSchema: z.ZodObject<{
    name: z.ZodString;
    templateId: z.ZodOptional<z.ZodString>;
    phoneNumberId: z.ZodOptional<z.ZodString>;
    audienceType: z.ZodEnum<["all", "segment", "contacts"]>;
    segmentIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    contactIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    scheduledAt: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    audienceType: "contacts" | "segment" | "all";
    message?: string | undefined;
    phoneNumberId?: string | undefined;
    templateId?: string | undefined;
    contactIds?: string[] | undefined;
    segmentIds?: string[] | undefined;
    scheduledAt?: string | undefined;
}, {
    name: string;
    audienceType: "contacts" | "segment" | "all";
    message?: string | undefined;
    phoneNumberId?: string | undefined;
    templateId?: string | undefined;
    contactIds?: string[] | undefined;
    segmentIds?: string[] | undefined;
    scheduledAt?: string | undefined;
}>;
export declare const updateCampaignSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    scheduledAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<["draft", "scheduled", "paused"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    status?: "paused" | "draft" | "scheduled" | undefined;
    scheduledAt?: string | null | undefined;
}, {
    name?: string | undefined;
    status?: "paused" | "draft" | "scheduled" | undefined;
    scheduledAt?: string | null | undefined;
}>;
export declare const createTemplateSchema: z.ZodObject<{
    name: z.ZodString;
    category: z.ZodEnum<["MARKETING", "UTILITY", "AUTHENTICATION"]>;
    language: z.ZodDefault<z.ZodString>;
    body: z.ZodString;
    headerType: z.ZodDefault<z.ZodEnum<["none", "text", "image", "video", "document"]>>;
    headerText: z.ZodOptional<z.ZodString>;
    headerMediaUrl: z.ZodOptional<z.ZodString>;
    footerText: z.ZodOptional<z.ZodString>;
    buttons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["quick_reply", "url", "phone"]>;
        text: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "url" | "phone" | "quick_reply";
        text: string;
        url?: string | undefined;
        phone?: string | undefined;
    }, {
        type: "url" | "phone" | "quick_reply";
        text: string;
        url?: string | undefined;
        phone?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    body: string;
    name: string;
    category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
    language: string;
    headerType: "none" | "text" | "image" | "video" | "document";
    buttons?: {
        type: "url" | "phone" | "quick_reply";
        text: string;
        url?: string | undefined;
        phone?: string | undefined;
    }[] | undefined;
    headerText?: string | undefined;
    footerText?: string | undefined;
    headerMediaUrl?: string | undefined;
}, {
    body: string;
    name: string;
    category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
    language?: string | undefined;
    buttons?: {
        type: "url" | "phone" | "quick_reply";
        text: string;
        url?: string | undefined;
        phone?: string | undefined;
    }[] | undefined;
    headerText?: string | undefined;
    footerText?: string | undefined;
    headerType?: "none" | "text" | "image" | "video" | "document" | undefined;
    headerMediaUrl?: string | undefined;
}>;
export declare const segmentConditionSchema: z.ZodObject<{
    field: z.ZodEnum<["tags", "city", "country", "lastMessageAt", "createdAt", "messagesSent", "language", "company"]>;
    operator: z.ZodEnum<["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "gt", "lt", "within_days"]>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
}, "strip", z.ZodTypeAny, {
    field: "createdAt" | "tags" | "company" | "language" | "city" | "country" | "lastMessageAt" | "messagesSent";
    operator: "gt" | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty" | "lt" | "within_days";
    value?: string | number | undefined;
}, {
    field: "createdAt" | "tags" | "company" | "language" | "city" | "country" | "lastMessageAt" | "messagesSent";
    operator: "gt" | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty" | "lt" | "within_days";
    value?: string | number | undefined;
}>;
export declare const createSegmentSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    conditions: z.ZodArray<z.ZodObject<{
        field: z.ZodEnum<["tags", "city", "country", "lastMessageAt", "createdAt", "messagesSent", "language", "company"]>;
        operator: z.ZodEnum<["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "gt", "lt", "within_days"]>;
        value: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    }, "strip", z.ZodTypeAny, {
        field: "createdAt" | "tags" | "company" | "language" | "city" | "country" | "lastMessageAt" | "messagesSent";
        operator: "gt" | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty" | "lt" | "within_days";
        value?: string | number | undefined;
    }, {
        field: "createdAt" | "tags" | "company" | "language" | "city" | "country" | "lastMessageAt" | "messagesSent";
        operator: "gt" | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty" | "lt" | "within_days";
        value?: string | number | undefined;
    }>, "many">;
    matchType: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    conditions: {
        field: "createdAt" | "tags" | "company" | "language" | "city" | "country" | "lastMessageAt" | "messagesSent";
        operator: "gt" | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty" | "lt" | "within_days";
        value?: string | number | undefined;
    }[];
    matchType: "ALL" | "ANY";
    description?: string | undefined;
}, {
    name: string;
    conditions: {
        field: "createdAt" | "tags" | "company" | "language" | "city" | "country" | "lastMessageAt" | "messagesSent";
        operator: "gt" | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty" | "lt" | "within_days";
        value?: string | number | undefined;
    }[];
    description?: string | undefined;
    matchType?: "ALL" | "ANY" | undefined;
}>;
export declare const checkoutSchema: z.ZodObject<{
    planTier: z.ZodEnum<["STARTER", "GROWTH", "BUSINESS"]>;
    interval: z.ZodDefault<z.ZodEnum<["monthly", "annual"]>>;
}, "strip", z.ZodTypeAny, {
    planTier: "STARTER" | "GROWTH" | "BUSINESS";
    interval: "monthly" | "annual";
}, {
    planTier: "STARTER" | "GROWTH" | "BUSINESS";
    interval?: "monthly" | "annual" | undefined;
}>;
export declare const updatePlanSchema: z.ZodObject<{
    planTier: z.ZodEnum<["STARTER", "GROWTH", "BUSINESS"]>;
    interval: z.ZodDefault<z.ZodEnum<["monthly", "annual"]>>;
}, "strip", z.ZodTypeAny, {
    planTier: "STARTER" | "GROWTH" | "BUSINESS";
    interval: "monthly" | "annual";
}, {
    planTier: "STARTER" | "GROWTH" | "BUSINESS";
    interval?: "monthly" | "annual" | undefined;
}>;
export declare const purchaseCreditsSchema: z.ZodEffects<z.ZodObject<{
    packId: z.ZodOptional<z.ZodString>;
    credits: z.ZodOptional<z.ZodNumber>;
    paymentMethodId: z.ZodOptional<z.ZodString>;
    currency: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    currency: string;
    credits?: number | undefined;
    packId?: string | undefined;
    paymentMethodId?: string | undefined;
}, {
    credits?: number | undefined;
    currency?: string | undefined;
    packId?: string | undefined;
    paymentMethodId?: string | undefined;
}>, {
    currency: string;
    credits?: number | undefined;
    packId?: string | undefined;
    paymentMethodId?: string | undefined;
}, {
    credits?: number | undefined;
    currency?: string | undefined;
    packId?: string | undefined;
    paymentMethodId?: string | undefined;
}>;
export declare const inviteMemberSchema: z.ZodObject<{
    email: z.ZodString;
    role: z.ZodEnum<["ADMIN", "MANAGER", "AGENT", "VIEWER"]>;
    maxChats: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
    maxChats: number;
}, {
    email: string;
    role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
    maxChats?: number | undefined;
}>;
export declare const updateMemberSchema: z.ZodObject<{
    role: z.ZodOptional<z.ZodEnum<["ADMIN", "MANAGER", "AGENT", "VIEWER"]>>;
    maxChats: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["active", "suspended"]>>;
}, "strip", z.ZodTypeAny, {
    role?: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER" | undefined;
    status?: "active" | "suspended" | undefined;
    maxChats?: number | undefined;
}, {
    role?: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER" | undefined;
    status?: "active" | "suspended" | undefined;
    maxChats?: number | undefined;
}>;
export declare const registerPhoneSchema: z.ZodObject<{
    displayName: z.ZodString;
    phoneNumber: z.ZodString;
    timezone: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    timezone: string;
    phoneNumber: string;
    displayName: string;
}, {
    phoneNumber: string;
    displayName: string;
    timezone?: string | undefined;
}>;
export declare const updateWebhookSchema: z.ZodObject<{
    url: z.ZodString;
    enabledEvents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    url: string;
    enabledEvents?: string[] | undefined;
}, {
    url: string;
    enabledEvents?: string[] | undefined;
}>;
export declare const updateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    avatarUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    timezone?: string | undefined;
    avatarUrl?: string | undefined;
    phone?: string | undefined;
    language?: string | undefined;
}, {
    name?: string | undefined;
    timezone?: string | undefined;
    avatarUrl?: string | undefined;
    phone?: string | undefined;
    language?: string | undefined;
}>;
export declare const updateNotificationsSchema: z.ZodObject<{
    newMessageNotifications: z.ZodOptional<z.ZodBoolean>;
    deliveryReports: z.ZodOptional<z.ZodBoolean>;
    weeklyDigest: z.ZodOptional<z.ZodBoolean>;
    billingAlerts: z.ZodOptional<z.ZodBoolean>;
    browserNotifications: z.ZodOptional<z.ZodBoolean>;
    smsAlerts: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    deliveryReports?: boolean | undefined;
    weeklyDigest?: boolean | undefined;
    billingAlerts?: boolean | undefined;
    browserNotifications?: boolean | undefined;
    smsAlerts?: boolean | undefined;
    newMessageNotifications?: boolean | undefined;
}, {
    deliveryReports?: boolean | undefined;
    weeklyDigest?: boolean | undefined;
    billingAlerts?: boolean | undefined;
    browserNotifications?: boolean | undefined;
    smsAlerts?: boolean | undefined;
    newMessageNotifications?: boolean | undefined;
}>;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodString>;
    order: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    order: "asc" | "desc";
    page: number;
    sort?: string | undefined;
}, {
    limit?: number | undefined;
    sort?: string | undefined;
    order?: "asc" | "desc" | undefined;
    page?: number | undefined;
}>;
export declare const dateRangeSchema: z.ZodObject<{
    start: z.ZodOptional<z.ZodString>;
    end: z.ZodOptional<z.ZodString>;
    period: z.ZodOptional<z.ZodEnum<["7d", "30d", "90d"]>>;
}, "strip", z.ZodTypeAny, {
    period?: "7d" | "30d" | "90d" | undefined;
    start?: string | undefined;
    end?: string | undefined;
}, {
    period?: "7d" | "30d" | "90d" | undefined;
    start?: string | undefined;
    end?: string | undefined;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PurchaseCreditsInput = z.infer<typeof purchaseCreditsSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
//# sourceMappingURL=validation.d.ts.map