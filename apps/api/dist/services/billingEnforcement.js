/**
 * Billing Enforcement Service
 * Server-side plan limits enforcement
 */
import { PlanTier } from '@prisma/client';
// Default limits per plan tier
const PLAN_LIMITS = {
    STARTER: {
        maxContacts: 500,
        maxMessagesPerMonth: 5000,
        maxPhoneNumbers: 1,
        maxUsers: 3,
        maxCampaigns: 5,
        maxAutomations: true,
        maxApiCallsPerMinute: 60,
        features: {
            analytics: true,
            teamManagement: false,
            customBranding: false,
            apiAccess: false,
            whiteLabel: false,
            prioritySupport: false,
        },
    },
    GROWTH: {
        maxContacts: 5000,
        maxMessagesPerMonth: 50000,
        maxPhoneNumbers: 3,
        maxUsers: 10,
        maxCampaigns: 25,
        maxAutomations: true,
        maxApiCallsPerMinute: 300,
        features: {
            analytics: true,
            teamManagement: true,
            customBranding: true,
            apiAccess: true,
            whiteLabel: false,
            prioritySupport: false,
        },
    },
    BUSINESS: {
        maxContacts: 50000,
        maxMessagesPerMonth: 500000,
        maxPhoneNumbers: 10,
        maxUsers: 50,
        maxCampaigns: 100,
        maxAutomations: true,
        maxApiCallsPerMinute: 1000,
        features: {
            analytics: true,
            teamManagement: true,
            customBranding: true,
            apiAccess: true,
            whiteLabel: false,
            prioritySupport: true,
        },
    },
    ENTERPRISE: {
        maxContacts: -1, // Unlimited
        maxMessagesPerMonth: -1,
        maxPhoneNumbers: -1,
        maxUsers: -1,
        maxCampaigns: -1,
        maxAutomations: true,
        maxApiCallsPerMinute: -1,
        features: {
            analytics: true,
            teamManagement: true,
            customBranding: true,
            apiAccess: true,
            whiteLabel: true,
            prioritySupport: true,
        },
    },
};
/**
 * Get plan limits for a tenant
 */
export function getPlanLimits(plan, configuredPlan) {
    const defaults = PLAN_LIMITS[plan] || PLAN_LIMITS.STARTER;
    if (!configuredPlan)
        return defaults;
    return {
        ...defaults,
        maxContacts: configuredPlan.maxContacts,
        maxMessagesPerMonth: configuredPlan.maxMessagesPerMonth,
        maxPhoneNumbers: configuredPlan.maxPhoneNumbers,
        maxUsers: configuredPlan.maxTeamMembers,
        maxCampaigns: configuredPlan.maxCampaigns,
        maxAutomations: configuredPlan.maxChatbotFlows > 0,
        maxApiCallsPerMinute: configuredPlan.maxMessagesPerMinute,
        features: {
            ...defaults.features,
            analytics: configuredPlan.hasAnalytics,
            teamManagement: configuredPlan.maxTeamMembers !== 0,
            customBranding: configuredPlan.hasCustomBranding,
            apiAccess: configuredPlan.hasAPI,
            whiteLabel: configuredPlan.hasWhiteLabel,
            prioritySupport: configuredPlan.hasPrioritySupport,
        },
    };
}
/**
 * Check if tenant is within plan limits
 */
export async function checkPlanLimits(prisma, tenantId) {
    // Get tenant with plan
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
    });
    if (!tenant) {
        throw new Error('Tenant not found');
    }
    const planTier = tenant.plan?.tier || PlanTier.STARTER;
    const limits = getPlanLimits(planTier, tenant.plan);
    // Get current usage
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [contacts, messagesThisMonth, phoneNumbers, users, campaigns, automations,] = await Promise.all([
        prisma.contact.count({ where: { tenantId, isActive: true } }),
        prisma.message.count({
            where: { tenantId, direction: 'OUTGOING', createdAt: { gte: monthStart } },
        }),
        prisma.phoneNumber.count({ where: { tenantId } }),
        prisma.user.count({ where: { tenantId, isActive: true } }),
        prisma.campaign.count({ where: { tenantId } }),
        prisma.botFlow.count({ where: { tenantId } }),
    ]);
    const usage = {
        contacts,
        messagesThisMonth,
        phoneNumbers,
        users,
        campaigns,
        automations,
    };
    // Check limits (-1 means unlimited)
    const overLimits = {
        contacts: limits.maxContacts !== -1 && contacts >= limits.maxContacts,
        messages: limits.maxMessagesPerMonth !== -1 && messagesThisMonth >= limits.maxMessagesPerMonth,
        phoneNumbers: limits.maxPhoneNumbers !== -1 && phoneNumbers >= limits.maxPhoneNumbers,
        users: limits.maxUsers !== -1 && users >= limits.maxUsers,
        campaigns: limits.maxCampaigns !== -1 && campaigns >= limits.maxCampaigns,
    };
    const blockedFeatures = [];
    if (!limits.features.teamManagement)
        blockedFeatures.push('Team Management');
    if (!limits.features.customBranding)
        blockedFeatures.push('Custom Branding');
    if (!limits.features.apiAccess)
        blockedFeatures.push('API Access');
    if (!limits.features.whiteLabel)
        blockedFeatures.push('White Label');
    return {
        plan: planTier,
        limits,
        usage,
        overLimits,
        canSend: !overLimits.contacts && !overLimits.messages,
        blockedFeatures,
    };
}
/**
 * Enforce contact limit before creation
 */
export async function enforceContactLimit(prisma, tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
    });
    if (!tenant) {
        return { allowed: false, error: 'Tenant not found', current: 0, limit: 0 };
    }
    const planTier = tenant.plan?.tier || PlanTier.STARTER;
    const limits = getPlanLimits(planTier, tenant.plan);
    if (limits.maxContacts === -1) {
        return { allowed: true, current: 0, limit: -1 };
    }
    const current = await prisma.contact.count({
        where: { tenantId, isActive: true },
    });
    if (current >= limits.maxContacts) {
        return {
            allowed: false,
            error: `Contact limit reached. Upgrade your plan to add more than ${limits.maxContacts} contacts.`,
            current,
            limit: limits.maxContacts,
        };
    }
    return { allowed: true, current, limit: limits.maxContacts };
}
/**
 * Enforce message limit before sending
 */
export async function enforceMessageLimit(prisma, tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
    });
    if (!tenant) {
        return { allowed: false, error: 'Tenant not found', current: 0, limit: 0 };
    }
    const planTier = tenant.plan?.tier || PlanTier.STARTER;
    const limits = getPlanLimits(planTier, tenant.plan);
    if (limits.maxMessagesPerMonth === -1) {
        return { allowed: true, current: 0, limit: -1 };
    }
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const current = await prisma.message.count({
        where: { tenantId, direction: 'OUTGOING', createdAt: { gte: monthStart } },
    });
    if (current >= limits.maxMessagesPerMonth) {
        return {
            allowed: false,
            error: `Monthly message limit reached. Upgrade your plan to send more than ${limits.maxMessagesPerMonth} messages per month.`,
            current,
            limit: limits.maxMessagesPerMonth,
        };
    }
    return { allowed: true, current, limit: limits.maxMessagesPerMonth };
}
/**
 * Enforce user limit before creation
 */
export async function enforceUserLimit(prisma, tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
    });
    if (!tenant) {
        return { allowed: false, error: 'Tenant not found', current: 0, limit: 0 };
    }
    const planTier = tenant.plan?.tier || PlanTier.STARTER;
    const limits = getPlanLimits(planTier, tenant.plan);
    if (limits.maxUsers === -1) {
        return { allowed: true, current: 0, limit: -1 };
    }
    const current = await prisma.user.count({
        where: { tenantId, isActive: true },
    });
    if (current >= limits.maxUsers) {
        return {
            allowed: false,
            error: `User limit reached. Upgrade your plan to add more than ${limits.maxUsers} users.`,
            current,
            limit: limits.maxUsers,
        };
    }
    return { allowed: true, current, limit: limits.maxUsers };
}
/**
 * Check if feature is available
 */
export async function checkFeatureAccess(prisma, tenantId, feature) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
    });
    if (!tenant)
        return false;
    const planTier = tenant.plan?.tier || PlanTier.STARTER;
    const limits = getPlanLimits(planTier, tenant.plan);
    return limits.features[feature];
}
//# sourceMappingURL=billingEnforcement.js.map