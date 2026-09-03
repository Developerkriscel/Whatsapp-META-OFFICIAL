/**
 * Team / Inbox Collaboration Routes
 * Agent assignment, round-robin, workload, availability
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { broadcastToTenant } from './sse.js';

export async function registerTeamRoutes(app: FastifyInstance): Promise<void> {

  // ============================================
  // TEAMS CRUD
  // ============================================

  app.get('/teams', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const teams = await app.prisma.team.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { name: 'asc' },
    });

    return { success: true, data: teams };
  });

  app.post('/teams', { preHandler: [app.requirePermission('team', 'create')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      autoAssign: z.boolean().optional(),
      assignmentMode: z.enum(['ROUND_ROBIN', 'LEAST_LOADED', 'PRIORITY']).optional(),
    });

    const body = schema.parse(request.body);

    const team = await app.prisma.team.create({
      data: {
        tenantId: request.authUser.tenantId,
        name: body.name,
        description: body.description,
        color: body.color || '#6366f1',
        autoAssign: body.autoAssign || false,
        assignmentMode: body.assignmentMode || 'ROUND_ROBIN',
      },
    });

    return reply.status(201).send({ success: true, data: team });
  });

  app.get('/teams/:teamId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { teamId } = z.object({ teamId: z.string() }).parse(request.params);

    const team = await app.prisma.team.findFirst({
      where: { id: teamId, tenantId: request.authUser.tenantId },
    });

    if (!team) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get team members
    const members = await app.prisma.user.findMany({
      where: { teamId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isOnline: true,
        status: true,
        maxChats: true,
        _count: { select: { conversations: { where: { status: 'OPEN' } } } },
      },
    });

    return { success: true, data: { ...team, members } };
  });

  app.put('/teams/:teamId', { preHandler: [app.requirePermission('team', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      autoAssign: z.boolean().optional(),
      assignmentMode: z.enum(['ROUND_ROBIN', 'LEAST_LOADED', 'PRIORITY']).optional(),
      isActive: z.boolean().optional(),
    });

    const { teamId } = z.object({ teamId: z.string() }).parse(request.params);
    const body = schema.parse(request.body);

    const team = await app.prisma.team.update({
      where: { id: teamId, tenantId: request.authUser.tenantId },
      data: body as any,
    });

    return { success: true, data: team };
  });

  app.delete('/teams/:teamId', { preHandler: [app.requirePermission('team', 'delete')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { teamId } = z.object({ teamId: z.string() }).parse(request.params);

    // Confirm the team is ours BEFORE touching any user rows. This used to
    // clear members first, unscoped — so passing another tenant's teamId
    // emptied their team even though the delete below then matched nothing.
    const team = await app.prisma.team.findFirst({
      where: { id: teamId, tenantId: request.authUser.tenantId },
      select: { id: true },
    });

    if (!team) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Remove members from team
    await app.prisma.user.updateMany({
      where: { teamId, tenantId: request.authUser.tenantId },
      data: { teamId: null },
    });

    await app.prisma.team.delete({
      where: { id: teamId, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { message: 'Team deleted' } };
  });

  // ============================================
  // TEAM MEMBERS
  // ============================================

  app.post('/teams/:teamId/members', { preHandler: [app.requirePermission('team', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      userId: z.string(),
    });

    const { teamId } = z.object({ teamId: z.string() }).parse(request.params);
    const { userId } = schema.parse(request.body);

    const team = await app.prisma.team.findFirst({
      where: { id: teamId, tenantId: request.authUser.tenantId },
    });

    if (!team) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const user = await app.prisma.user.findFirst({
      where: { id: userId, tenantId: request.authUser.tenantId },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND' } });
    }

    await app.prisma.user.update({
      where: { id: userId },
      data: { teamId },
    });

    return { success: true, data: { message: 'Member added to team' } };
  });

  app.delete('/teams/:teamId/members/:userId', { preHandler: [app.requirePermission('team', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { teamId, userId } = z.object({ teamId: z.string(), userId: z.string() }).parse(request.params);

    const team = await app.prisma.team.findFirst({
      where: { id: teamId, tenantId: request.authUser.tenantId },
    });

    if (!team) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const user = await app.prisma.user.findFirst({
      where: { id: userId, tenantId: request.authUser.tenantId, teamId },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND' } });
    }

    await app.prisma.user.update({
      where: { id: userId },
      data: { teamId: null },
    });

    return { success: true, data: { message: 'Member removed from team' } };
  });

  // ============================================
  // AGENT STATUS & AVAILABILITY
  // ============================================

  app.get('/agents', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { status, teamId } = request.query as { status?: string; teamId?: string };

    const where: any = {
      tenantId: request.authUser.tenantId,
      isActive: true,
      role: { in: ['AGENT', 'MANAGER', 'ADMIN', 'OWNER'] },
    };

    if (status) where.status = status;
    if (teamId) where.teamId = teamId;

    const agents = await app.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        isOnline: true,
        status: true,
        lastSeenAt: true,
        maxChats: true,
        teamId: true,
        team: { select: { id: true, name: true, color: true } },
        _count: {
          select: { conversations: { where: { status: 'OPEN' } } },
        },
        totalAssigned: true,
        totalResolved: true,
        avgResponseTime: true,
      },
      orderBy: [
        { status: 'asc' },
        { name: 'asc' },
      ],
    });

    return { success: true, data: agents };
  });

  app.put('/agents/:agentId/status', { preHandler: [app.requirePermission('team', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      status: z.enum(['ONLINE', 'OFFLINE', 'AWAY', 'BUSY']),
      awayUntil: z.string().datetime().optional(),
    });

    const { agentId } = z.object({ agentId: z.string() }).parse(request.params);
    const { status, awayUntil } = schema.parse(request.body);

    const agent = await app.prisma.user.findFirst({
      where: { id: agentId, tenantId: request.authUser.tenantId },
    });

    if (!agent) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const updateData: any = {
      status,
      isOnline: status === 'ONLINE',
      lastSeenAt: status === 'OFFLINE' ? new Date() : undefined,
      awayUntil: awayUntil ? new Date(awayUntil) : undefined,
    };

    if (status === 'AWAY' && awayUntil && new Date(awayUntil) < new Date()) {
      updateData.status = 'OFFLINE';
      updateData.isOnline = false;
    }

    const updated = await app.prisma.user.update({
      where: { id: agentId },
      data: updateData,
    });

    broadcastToTenant(request.authUser.tenantId, {
      event: 'agent_status',
      data: {
        agentId: updated.id,
        status: updated.status,
        isOnline: updated.isOnline,
      },
    });

    return { success: true, data: updated };
  });

  // ============================================
  // CONVERSATION ASSIGNMENT
  // ============================================

  app.post('/conversations/:conversationId/transfer', { preHandler: [app.requirePermission('conversations', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      agentId: z.string(),
      reason: z.string().optional(),
    });

    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);
    const { agentId, reason } = schema.parse(request.body);

    const conversation = await app.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
    });

    if (!conversation) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const targetAgent = await app.prisma.user.findFirst({
      where: { id: agentId, tenantId: request.authUser.tenantId },
    });

    if (!targetAgent) {
      return reply.status(404).send({ success: false, error: { code: 'AGENT_NOT_FOUND' } });
    }

    const previousAgentId = conversation.assignedToId;

    const updated = await app.prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedToId: agentId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    broadcastToTenant(request.authUser.tenantId, {
      event: 'conversation_transferred',
      data: {
        conversationId,
        fromAgentId: previousAgentId,
        toAgentId: agentId,
        reason,
      },
    });

    await app.prisma.notification.create({
      data: {
        tenantId: request.authUser.tenantId,
        userId: agentId,
        type: 'CONVERSATION_TRANSFERRED',
        title: 'Conversation Transferred to You',
        message: reason || 'A conversation has been transferred to you',
        priority: 'NORMAL',
      },
    });

    return { success: true, data: updated };
  });

  // ============================================
  // WORKLOAD & ANALYTICS
  // ============================================

  app.get('/agents/workload', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const agents = await app.prisma.user.findMany({
      where: {
        tenantId: request.authUser.tenantId,
        isActive: true,
        role: { in: ['AGENT', 'MANAGER', 'ADMIN', 'OWNER'] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        isOnline: true,
        maxChats: true,
        totalAssigned: true,
        totalResolved: true,
        avgResponseTime: true,
        team: { select: { id: true, name: true } },
        _count: {
          select: {
            conversations: { where: { status: 'OPEN' } },
          },
        },
      },
      orderBy: { totalAssigned: 'desc' },
    });

    const workload = agents.map(agent => ({
      ...agent,
      openChats: agent._count.conversations,
      capacity: agent.maxChats || 5,
      utilization: Math.round((agent._count.conversations / (agent.maxChats || 5)) * 100),
    }));

    return { success: true, data: workload };
  });

  app.get('/agents/:agentId/stats', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { agentId } = z.object({ agentId: z.string() }).parse(request.params);
    const { period = '7d' } = request.query as { period?: string };

    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const conversations = await app.prisma.conversation.findMany({
      where: {
        assignedToId: agentId,
        tenantId: request.authUser.tenantId,
        openedAt: { gte: startDate },
      },
      include: {
        messages: {
          where: { senderId: agentId },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const totalAssigned = conversations.length;
    const resolved = conversations.filter(c => c.status === 'CLOSED').length;
    const avgResolutionTime = conversations
      .filter(c => c.closedAt && c.openedAt)
      .reduce((acc, c) => acc + (c.closedAt!.getTime() - c.openedAt.getTime()), 0) / (resolved || 1);

    const firstResponses = conversations
      .filter(c => c.messages.length > 0)
      .map(c => c.messages[0].createdAt.getTime() - c.openedAt.getTime());
    const avgFirstResponse = firstResponses.length > 0
      ? firstResponses.reduce((a, b) => a + b, 0) / firstResponses.length / 1000
      : 0;

    const agent = await app.prisma.user.findFirst({
      where: { id: agentId },
      select: { name: true, totalAssigned: true, totalResolved: true, avgResponseTime: true },
    });

    return {
      success: true,
      data: {
        agentName: agent?.name,
        period,
        totalAssigned,
        resolved,
        resolutionRate: totalAssigned > 0 ? Math.round((resolved / totalAssigned) * 100) : 0,
        avgResolutionTimeSeconds: Math.round(avgResolutionTime / 1000),
        avgFirstResponseSeconds: Math.round(avgFirstResponse),
        openConversations: conversations.filter(c => c.status === 'OPEN').length,
        allTime: {
          totalAssigned: agent?.totalAssigned || 0,
          totalResolved: agent?.totalResolved || 0,
          avgResponseTime: agent?.avgResponseTime || 0,
        },
      },
    };
  });
}
