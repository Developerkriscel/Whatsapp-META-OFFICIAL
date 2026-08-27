/**
 * Automation / Chatbot Builder Routes
 * Implements: Triggers → Conditions → Actions → Delays → Human Handoff
 */
import { z } from 'zod';
import { broadcastToTenant } from './sse.js';
import { getAISuggestion } from '../services/aiAssist.js';
// Predefined flow templates, used by both GET /automation/templates (listing) and
// POST /automation/templates/:id/clone (cloning) — previously these were two
// separate hardcoded literals that had drifted out of sync (clone's copy was
// missing 'order-status' entirely and had different message text).
const FLOW_TEMPLATES = {
    welcome: {
        name: 'Welcome Message',
        description: 'Simple greeting flow that introduces your business',
        category: 'greeting',
        flowData: {
            steps: [
                { id: 'trigger-1', type: 'trigger', triggerType: 'greeting', label: 'Customer sends first message', next: 'msg-1' },
                { id: 'msg-1', type: 'message', message: 'Hello! Welcome to {{business_name}}. How can we help you today?', next: 'delay-1' },
                { id: 'delay-1', type: 'delay', seconds: 30, next: 'handoff-1' },
                { id: 'handoff-1', type: 'action', actionType: 'handoff', label: 'Hand off to human agent', next: null },
            ],
            variables: [],
        },
    },
    support: {
        name: 'Support Bot',
        description: 'General support with human handoff',
        category: 'support',
        flowData: {
            steps: [
                { id: 'trigger-1', type: 'trigger', triggerType: 'greeting', label: 'Any incoming message', next: 'msg-1' },
                { id: 'msg-1', type: 'message', message: 'Welcome! How can we help?\n\n1. Sales\n2. Technical Support\n3. Billing\n\nReply with the number or describe your issue.', next: 'condition-1' },
                { id: 'condition-1', type: 'condition', conditionType: 'contains', value: '1', label: 'Customer chose Sales?', truePath: 'action-sales', falsePath: 'action-support' },
                { id: 'action-sales', type: 'action', actionType: 'assign_team', label: 'Assign to Sales Team', next: null },
                { id: 'action-support', type: 'action', actionType: 'handoff', label: 'Hand off to Support', next: null },
            ],
            variables: [],
        },
    },
    'order-status': {
        name: 'Order Status',
        description: 'Let customers check their order status',
        category: 'support',
        flowData: {
            steps: [
                { id: 'trigger-1', type: 'trigger', triggerType: 'keyword', keyword: 'order status', label: 'Customer asks about order', next: 'msg-1' },
                { id: 'msg-1', type: 'message', message: 'Sure! Please provide your order ID to check the status.', next: 'end-1' },
                { id: 'end-1', type: 'end', label: 'End flow', next: null },
            ],
            variables: ['order_id'],
        },
    },
};
const FLOW_STEP_TYPES = ['trigger', 'message', 'condition', 'delay', 'action', 'ai_reply', 'end'];
export async function registerAutomationRoutes(app) {
    // ============================================
    // BOT FLOWS CRUD
    // ============================================
    /**
     * GET /automation/flows - List all bot flows
     */
    app.get('/automation/flows', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const flows = await app.prisma.botFlow.findMany({
            where: { tenantId: request.authUser.tenantId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { executions: true } },
            },
        });
        return { success: true, data: flows };
    });
    /**
     * POST /automation/flows - Create a new bot flow
     */
    app.post('/automation/flows', { preHandler: [app.requirePermission('flows', 'create')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            name: z.string().min(1).max(100),
            description: z.string().optional(),
            isDefault: z.boolean().optional(),
            fallbackMessage: z.string().optional(),
            businessHoursMode: z.boolean().optional(),
            offHoursMessage: z.string().optional(),
            enableHumanHandoff: z.boolean().optional(),
            handoffKeywords: z.array(z.string()).optional(),
            phoneNumberIds: z.array(z.string()).optional(),
            // Optional — lets callers (e.g. the AI flow-suggest feature) create a flow
            // pre-populated with steps instead of always starting from an empty shell.
            flowData: z.object({
                steps: z.array(z.any()),
                variables: z.array(z.any()),
            }).optional(),
        });
        const body = schema.parse(request.body);
        if (body.isDefault) {
            await app.prisma.botFlow.updateMany({
                where: { tenantId: request.authUser.tenantId, isDefault: true },
                data: { isDefault: false },
            });
        }
        const flow = await app.prisma.botFlow.create({
            data: {
                tenantId: request.authUser.tenantId,
                name: body.name,
                description: body.description,
                isDefault: body.isDefault || false,
                fallbackMessage: body.fallbackMessage,
                businessHoursMode: body.businessHoursMode ?? true,
                offHoursMessage: body.offHoursMessage,
                enableHumanHandoff: body.enableHumanHandoff ?? true,
                handoffKeywords: body.handoffKeywords || ['human', 'agent', 'person', 'help'],
                phoneNumberIds: body.phoneNumberIds || [],
                flowData: body.flowData || { steps: [], variables: [] },
            },
        });
        return reply.status(201).send({ success: true, data: flow });
    });
    /**
     * GET /automation/flows/:flowId - Get flow details
     */
    app.get('/automation/flows/:flowId', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { flowId } = z.object({ flowId: z.string() }).parse(request.params);
        const flow = await app.prisma.botFlow.findFirst({
            where: { id: flowId, tenantId: request.authUser.tenantId },
        });
        if (!flow) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        return { success: true, data: flow };
    });
    /**
     * PUT /automation/flows/:flowId - Update flow (including flowData steps)
     */
    app.put('/automation/flows/:flowId', { preHandler: [app.requirePermission('flows', 'update')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            name: z.string().min(1).max(100).optional(),
            description: z.string().optional(),
            flowData: z.object({
                steps: z.array(z.any()),
                variables: z.array(z.any()),
            }).optional(),
            isActive: z.boolean().optional(),
            isDefault: z.boolean().optional(),
            fallbackMessage: z.string().optional(),
            businessHoursMode: z.boolean().optional(),
            offHoursMessage: z.string().optional(),
            enableHumanHandoff: z.boolean().optional(),
            handoffKeywords: z.array(z.string()).optional(),
            phoneNumberIds: z.array(z.string()).optional(),
            assignToTeamId: z.string().optional(),
            assignToUserId: z.string().optional(),
        });
        const { flowId } = z.object({ flowId: z.string() }).parse(request.params);
        const body = schema.parse(request.body);
        const flow = await app.prisma.botFlow.findFirst({
            where: { id: flowId, tenantId: request.authUser.tenantId },
        });
        if (!flow) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        if (body.isDefault) {
            await app.prisma.botFlow.updateMany({
                where: { tenantId: request.authUser.tenantId, isDefault: true, id: { not: flowId } },
                data: { isDefault: false },
            });
        }
        const updated = await app.prisma.botFlow.update({
            where: { id: flowId },
            data: body,
        });
        return { success: true, data: updated };
    });
    /**
     * DELETE /automation/flows/:flowId - Delete flow
     */
    app.delete('/automation/flows/:flowId', { preHandler: [app.requirePermission('flows', 'delete')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { flowId } = z.object({ flowId: z.string() }).parse(request.params);
        await app.prisma.botFlow.deleteMany({
            where: { id: flowId, tenantId: request.authUser.tenantId },
        });
        return { success: true, data: { message: 'Flow deleted' } };
    });
    /**
     * POST /automation/flows/:flowId/activate - Activate a flow
     */
    app.post('/automation/flows/:flowId/activate', { preHandler: [app.requirePermission('flows', 'update')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { flowId } = z.object({ flowId: z.string() }).parse(request.params);
        const flow = await app.prisma.botFlow.findFirst({
            where: { id: flowId, tenantId: request.authUser.tenantId },
        });
        if (!flow) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const updated = await app.prisma.botFlow.update({
            where: { id: flowId },
            data: { isActive: true },
        });
        return { success: true, data: updated };
    });
    /**
     * POST /automation/flows/:flowId/deactivate - Deactivate a flow
     */
    app.post('/automation/flows/:flowId/deactivate', { preHandler: [app.requirePermission('flows', 'update')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { flowId } = z.object({ flowId: z.string() }).parse(request.params);
        const flow = await app.prisma.botFlow.findFirst({
            where: { id: flowId, tenantId: request.authUser.tenantId },
        });
        if (!flow) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const updated = await app.prisma.botFlow.update({
            where: { id: flowId },
            data: { isActive: false },
        });
        return { success: true, data: updated };
    });
    // ============================================
    // FLOW EXECUTION & TRIGGERING
    // ============================================
    /**
     * POST /automation/trigger - Trigger a flow for a conversation
     */
    app.post('/automation/trigger', { preHandler: [app.requirePermission('flows', 'update')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            conversationId: z.string(),
            trigger: z.enum(['greeting', 'keyword', 'always']).optional(),
            keyword: z.string().optional(),
        });
        const body = schema.parse(request.body);
        const result = await triggerFlowForConversation(app, request.authUser.tenantId, body.conversationId, {
            keyword: body.keyword,
        });
        return result;
    });
    /**
     * GET /automation/executions - Get flow execution history
     */
    app.get('/automation/executions', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { page = '1', limit = '20', flowId } = request.query;
        const where = { tenantId: request.authUser.tenantId };
        if (flowId)
            where.flowId = flowId;
        const [executions, total] = await Promise.all([
            app.prisma.botExecution.findMany({
                where,
                include: {
                    flow: { select: { name: true } },
                    contact: { select: { name: true, phone: true } },
                },
                orderBy: { startedAt: 'desc' },
                take: parseInt(limit) || 20,
                skip: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20),
            }),
            app.prisma.botExecution.count({ where }),
        ]);
        return {
            success: true,
            data: executions,
            meta: { page: parseInt(page) || 1, limit: parseInt(limit) || 20, total },
        };
    });
    // ============================================
    // FLOW TEMPLATES
    // ============================================
    /**
     * GET /automation/templates - Get predefined flow templates
     */
    app.get('/automation/templates', async (request, reply) => {
        const templates = Object.entries(FLOW_TEMPLATES).map(([id, tpl]) => ({ id, ...tpl }));
        return { success: true, data: templates };
    });
    /**
     * POST /automation/flows/suggest - Mistral proposes a flow structure from a plain-
     * language intent, constrained to the same step-type vocabulary the visual builder
     * supports. Every step is validated (allowed type, resolvable next/truePath/falsePath)
     * before being returned — malformed AI output never reaches the frontend as-is.
     * data: null when AI isn't configured or the call fails.
     */
    app.post('/automation/flows/suggest', { preHandler: [app.requirePermission('flows', 'create')] }, async (request, reply) => {
        const { intent } = z.object({ intent: z.string().min(1) }).parse(request.body);
        const suggestion = await getAISuggestion({
            module: 'flow',
            context: { intent, stepTypes: FLOW_STEP_TYPES },
        });
        if (!suggestion) {
            return { success: true, data: null };
        }
        let parsed;
        try {
            const jsonText = suggestion.suggestion.replace(/^```json\s*|\s*```$/g, '').trim();
            parsed = JSON.parse(jsonText);
        }
        catch {
            return { success: true, data: null };
        }
        const steps = parsed.steps || [];
        const ids = new Set(steps.map((s) => s.id));
        const valid = steps.length > 0 &&
            steps.every((s) => FLOW_STEP_TYPES.includes(s.type)) &&
            steps.every((s) => [s.next, s.truePath, s.falsePath].every((ref) => ref == null || ids.has(ref)));
        if (!valid) {
            return reply.status(502).send({
                success: false,
                error: { code: 'AI_FLOW_INVALID', message: 'The AI-generated flow did not match the expected step structure.' },
            });
        }
        return { success: true, data: { steps, variables: parsed.variables || [], rationale: suggestion.rationale } };
    });
    /**
     * POST /automation/templates/:templateId/clone - Clone a template into a new flow
     */
    app.post('/automation/templates/:templateId/clone', { preHandler: [app.requirePermission('flows', 'create')] }, async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { templateId } = z.object({ templateId: z.string() }).parse(request.params);
        const templateData = FLOW_TEMPLATES[templateId];
        if (!templateData) {
            return reply.status(404).send({ success: false, error: { code: 'TEMPLATE_NOT_FOUND' } });
        }
        const flow = await app.prisma.botFlow.create({
            data: {
                tenantId: request.authUser.tenantId,
                name: `${templateData.name} (copy)`,
                description: templateData.description,
                flowData: templateData.flowData,
                isActive: false,
            },
        });
        return reply.status(201).send({ success: true, data: flow });
    });
}
// ============================================
// Flow Execution Engine
// ============================================
/**
 * Finds the active flow for a conversation's phone number and runs it from the
 * start. Shared by the manual POST /automation/trigger route and the inbound
 * webhook handler (webhooks.ts), which previously never triggered flows at
 * all — a connected bot flow could never actually greet or respond to a real
 * incoming WhatsApp message.
 */
export async function triggerFlowForConversation(app, tenantId, conversationId, opts = {}) {
    const conversation = await app.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        include: { contact: true, phoneNumber: true },
    });
    if (!conversation) {
        return { success: false, error: { code: 'NOT_FOUND' } };
    }
    if (!conversation.isBotActive) {
        return { success: false, error: { code: 'BOT_INACTIVE', message: 'Bot is paused for this conversation' } };
    }
    // Find active flow for this phone number
    let flow = await app.prisma.botFlow.findFirst({
        where: {
            tenantId,
            isActive: true,
            phoneNumberIds: { has: conversation.phoneNumberId },
        },
    });
    // Fall back to default flow
    if (!flow) {
        flow = await app.prisma.botFlow.findFirst({
            where: { tenantId, isActive: true, isDefault: true },
        });
    }
    if (!flow) {
        return { success: false, error: { code: 'NO_ACTIVE_FLOW', message: 'No active bot flow found' } };
    }
    // Check for human handoff keywords
    if (flow.enableHumanHandoff && opts.keyword) {
        const keyword = opts.keyword.toLowerCase();
        const hasHandoffKeyword = flow.handoffKeywords.some((kw) => keyword.includes(kw.toLowerCase()));
        if (hasHandoffKeyword) {
            await app.prisma.conversation.update({
                where: { id: conversation.id },
                data: { isBotActive: false },
            });
            if (flow.assignToUserId) {
                await app.prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { assignedToId: flow.assignToUserId, status: 'OPEN' },
                });
            }
            return {
                success: true,
                data: { action: 'handoff', message: 'Conversation transferred to human agent' },
            };
        }
    }
    // Create execution record
    const execution = await app.prisma.botExecution.create({
        data: {
            flowId: flow.id,
            tenantId,
            contactId: conversation.contactId,
            conversationId: conversation.id,
            currentStep: 'start',
            status: 'ACTIVE',
        },
    });
    await app.prisma.botFlow.update({
        where: { id: flow.id },
        data: { totalTriggered: { increment: 1 } },
    });
    const result = await executeFlowStep(app, flow, execution, conversation, opts.keyword);
    return {
        success: true,
        data: { executionId: execution.id, flowId: flow.id, result },
    };
}
async function executeFlowStep(app, flow, execution, conversation, inboundText) {
    const flowData = flow.flowData;
    const steps = flowData?.steps || [];
    const currentStep = steps.find((s) => s.id === execution.currentStep) ||
        steps.find((s) => s.type === 'trigger'); // start from first trigger
    if (!currentStep) {
        await app.prisma.botExecution.update({
            where: { id: execution.id },
            data: { status: 'COMPLETED', endedAt: new Date() },
        });
        return { action: 'completed' };
    }
    switch (currentStep.type) {
        case 'trigger':
            if (currentStep.next) {
                await app.prisma.botExecution.update({
                    where: { id: execution.id },
                    data: { currentStep: currentStep.next, stepsExecuted: { increment: 1 } },
                });
                return executeFlowStep(app, flow, { ...execution, currentStep: currentStep.next }, conversation, inboundText);
            }
            break;
        case 'message':
            if (currentStep.message) {
                // This used to only write a local Message row and broadcast an SSE
                // event — it never actually reached Meta, so bot replies never
                // arrived on the real customer's WhatsApp at all. Dispatch for real,
                // using the same tenant-scoped sender the manual reply box uses.
                const message = await app.prisma.message.create({
                    data: {
                        tenantId: flow.tenantId,
                        conversationId: conversation.id,
                        contactId: conversation.contactId,
                        phoneNumberId: conversation.phoneNumberId,
                        direction: 'OUTGOING',
                        type: 'TEXT',
                        body: currentStep.message,
                        status: 'PENDING',
                    },
                });
                const { dispatchOutboundMessage } = await import('../services/whatsappService.js');
                await dispatchOutboundMessage({
                    app,
                    messageId: message.id,
                    tenantId: flow.tenantId,
                    contactPhone: conversation.contact?.phone || '',
                    phoneNumberId: conversation.phoneNumberId,
                    body: currentStep.message,
                    type: 'text',
                });
                broadcastToTenant(flow.tenantId, {
                    event: 'new_message',
                    data: {
                        conversationId: conversation.id,
                        body: currentStep.message,
                        direction: 'OUTGOING',
                        timestamp: new Date().toISOString(),
                    },
                });
            }
            if (currentStep.next) {
                await app.prisma.botExecution.update({
                    where: { id: execution.id },
                    data: { currentStep: currentStep.next, stepsExecuted: { increment: 1 } },
                });
                return executeFlowStep(app, flow, { ...execution, currentStep: currentStep.next }, conversation, inboundText);
            }
            break;
        case 'ai_reply': {
            // Same dispatch pattern as 'message', but the reply text is AI
            // generated instead of pre-written, via one of two modes:
            //   - simple mode (businessDescription set): a direct system-prompt
            //     call, no retrieval — the "just describe your business" path for
            //     tenants who don't want to set up a knowledge base first.
            //   - knowledge-base mode (knowledgeBaseId set): full RAG retrieval
            //     grounded in the tenant's uploaded documents.
            // The bot must never send nothing — if there's no inbound text, or
            // generation fails/finds nothing relevant, fall back to fallbackMessage.
            let generatedReply = null;
            if (inboundText && currentStep.businessDescription) {
                const { generateSimpleReply } = await import('../services/aiAssist.js');
                generatedReply = await generateSimpleReply({
                    systemPrompt: `${currentStep.systemPrompt || 'You are a helpful, friendly assistant.'}\n\nAbout the business:\n${currentStep.businessDescription}\n\nAnswer naturally and helpfully based on this. If you don't know something specific, offer to connect the customer with a human.`,
                    userMessage: inboundText,
                });
            }
            else if (inboundText && currentStep.knowledgeBaseId) {
                const { generateRagReply } = await import('../services/knowledgeBase.js');
                const result = await generateRagReply({
                    prisma: app.prisma,
                    tenantId: flow.tenantId,
                    knowledgeBaseId: currentStep.knowledgeBaseId,
                    systemPrompt: currentStep.systemPrompt || 'You are a helpful business assistant.',
                    userMessage: inboundText,
                });
                generatedReply = result?.reply || null;
            }
            const replyText = generatedReply ||
                currentStep.fallbackMessage ||
                "I'm not sure about that — let me connect you with a member of our team.";
            const message = await app.prisma.message.create({
                data: {
                    tenantId: flow.tenantId,
                    conversationId: conversation.id,
                    contactId: conversation.contactId,
                    phoneNumberId: conversation.phoneNumberId,
                    direction: 'OUTGOING',
                    type: 'TEXT',
                    body: replyText,
                    status: 'PENDING',
                },
            });
            const { dispatchOutboundMessage } = await import('../services/whatsappService.js');
            await dispatchOutboundMessage({
                app,
                messageId: message.id,
                tenantId: flow.tenantId,
                contactPhone: conversation.contact?.phone || '',
                phoneNumberId: conversation.phoneNumberId,
                body: replyText,
                type: 'text',
            });
            broadcastToTenant(flow.tenantId, {
                event: 'new_message',
                data: {
                    conversationId: conversation.id,
                    body: replyText,
                    direction: 'OUTGOING',
                    timestamp: new Date().toISOString(),
                },
            });
            if (currentStep.next) {
                await app.prisma.botExecution.update({
                    where: { id: execution.id },
                    data: { currentStep: currentStep.next, stepsExecuted: { increment: 1 } },
                });
                return executeFlowStep(app, flow, { ...execution, currentStep: currentStep.next }, conversation, inboundText);
            }
            break;
        }
        case 'delay':
            // Real wait, not just an immediate pass-through. Capped at 120s so a
            // misconfigured flow can't hang a worker indefinitely — reach for a
            // real job queue (BullMQ) instead if longer delays are ever needed.
            {
                const seconds = Math.min(Math.max(Number(currentStep.seconds) || 0, 0), 120);
                if (seconds > 0) {
                    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
                }
            }
            if (currentStep.next) {
                await app.prisma.botExecution.update({
                    where: { id: execution.id },
                    data: { currentStep: currentStep.next, stepsExecuted: { increment: 1 } },
                });
                return executeFlowStep(app, flow, { ...execution, currentStep: currentStep.next }, conversation, inboundText);
            }
            break;
        case 'condition': {
            // Evaluate the condition against the actual inbound message text.
            // Falls back to truePath when there's no inbound text to test against
            // (e.g. a manually-triggered execution) rather than silently mismatching.
            const value = String(currentStep.value ?? '').toLowerCase();
            const text = (inboundText ?? '').toLowerCase();
            let matched = true;
            if (inboundText !== undefined) {
                switch (currentStep.conditionType) {
                    case 'equals':
                        matched = text === value;
                        break;
                    case 'starts_with':
                        matched = text.startsWith(value);
                        break;
                    case 'ends_with':
                        matched = text.endsWith(value);
                        break;
                    case 'contains':
                    default:
                        matched = value.length > 0 && text.includes(value);
                        break;
                }
            }
            const nextStep = matched ? (currentStep.truePath || currentStep.next) : currentStep.falsePath;
            if (nextStep) {
                await app.prisma.botExecution.update({
                    where: { id: execution.id },
                    data: { currentStep: nextStep, stepsExecuted: { increment: 1 } },
                });
                return executeFlowStep(app, flow, { ...execution, currentStep: nextStep }, conversation, inboundText);
            }
            break;
        }
        case 'action':
            if (currentStep.actionType === 'handoff') {
                await app.prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { isBotActive: false },
                });
                await app.prisma.botExecution.update({
                    where: { id: execution.id },
                    data: { status: 'HANDED_OFF', endedAt: new Date() },
                });
                return { action: 'handoff' };
            }
            break;
        case 'end':
        default:
            break;
    }
    await app.prisma.botExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED', endedAt: new Date() },
    });
    return { action: 'completed' };
}
//# sourceMappingURL=automation.js.map