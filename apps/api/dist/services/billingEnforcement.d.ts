/**
 * Billing Enforcement Service
 * Server-side plan limits enforcement
 */
import { PrismaClient, PlanTier } from '@prisma/client';
interface PlanLimits {
    maxContacts: number;
    maxMessagesPerMonth: number;
    maxPhoneNumbers: number;
    maxUsers: number;
    maxCampaigns: number;
    maxAutomations: boolean;
    maxApiCallsPerMinute: number;
    features: {
        analytics: boolean;
        teamManagement: boolean;
        customBranding: boolean;
        apiAccess: boolean;
        whiteLabel: boolean;
        prioritySupport: boolean;
    };
}
export interface UsageStats {
    contacts: number;
    messagesThisMonth: number;
    phoneNumbers: number;
    users: number;
    campaigns: number;
    automations: number;
}
export interface PlanStatus {
    plan: PlanTier;
    limits: PlanLimits;
    usage: UsageStats;
    overLimits: {
        contacts: boolean;
        messages: boolean;
        phoneNumbers: boolean;
        users: boolean;
        campaigns: boolean;
    };
    canSend: boolean;
    blockedFeatures: string[];
}
/**
 * Get plan limits for a tenant
 */
export declare function getPlanLimits(plan: PlanTier): PlanLimits;
/**
 * Check if tenant is within plan limits
 */
export declare function checkPlanLimits(prisma: PrismaClient, tenantId: string): Promise<PlanStatus>;
/**
 * Enforce contact limit before creation
 */
export declare function enforceContactLimit(prisma: PrismaClient, tenantId: string): Promise<{
    allowed: boolean;
    error?: string;
    current: number;
    limit: number;
}>;
/**
 * Enforce message limit before sending
 */
export declare function enforceMessageLimit(prisma: PrismaClient, tenantId: string): Promise<{
    allowed: boolean;
    error?: string;
    current: number;
    limit: number;
}>;
/**
 * Enforce user limit before creation
 */
export declare function enforceUserLimit(prisma: PrismaClient, tenantId: string): Promise<{
    allowed: boolean;
    error?: string;
    current: number;
    limit: number;
}>;
/**
 * Check if feature is available
 */
export declare function checkFeatureAccess(prisma: PrismaClient, tenantId: string, feature: 'teamManagement' | 'customBranding' | 'apiAccess' | 'whiteLabel'): Promise<boolean>;
export {};
//# sourceMappingURL=billingEnforcement.d.ts.map