/**
 * Production Monitoring Routes
 * Health checks, metrics, and system status
 */

import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    api: 'healthy' | 'unhealthy';
    database: 'healthy' | 'unhealthy';
    redis?: 'healthy' | 'unhealthy';
    bullmq?: 'healthy' | 'unhealthy';
  };
  metrics?: {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
  };
}

interface SystemMetrics {
  memory: NodeJS.MemoryUsage;
  cpu: { usage: number };
  uptime: number;
  pid: number;
}

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {

  // Store for metrics
  const requestLog: { timestamp: number; duration: number; status: number }[] = [];
  const startTime = Date.now();

  // Track requests for metrics
  app.addHook('onResponse', (request, reply, done) => {
    requestLog.push({
      timestamp: Date.now(),
      duration: reply.elapsedTime,
      status: reply.statusCode,
    });
    // Keep only last 60 entries
    if (requestLog.length > 60) requestLog.shift();
    done();
  });

  // ============================================
  // DETAILED HEALTH CHECK
  // ============================================

  /**
   * GET /api/health/detailed - Detailed health with all services
   */
  app.get('/api/health/detailed', async (request, reply) => {
    const status: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {
        api: 'healthy',
        database: 'unhealthy',
      },
    };

    // Check database
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      status.services.database = 'healthy';
    } catch (error) {
      status.services.database = 'unhealthy';
      status.status = 'degraded';
    }

    // Check Redis if available
    const appAny = app as any;
    try {
      if (appAny.redis) {
        await appAny.redis.ping();
        status.services.redis = 'healthy';
      }
    } catch {
      status.services.redis = 'unhealthy';
      status.status = 'degraded';
    }

    // Check BullMQ if available
    try {
      if (appAny.bullmq) {
        const failed = await appAny.bullmq.getFailedCount();
        if (failed > 100) {
          status.services.bullmq = 'unhealthy';
          status.status = 'degraded';
        } else {
          status.services.bullmq = 'healthy';
        }
      }
    } catch {
      status.services.bullmq = 'unhealthy';
    }

    // Calculate metrics
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = requestLog.filter(r => r.timestamp > oneMinuteAgo);

    if (recentRequests.length > 0) {
      status.metrics = {
        requestsPerMinute: recentRequests.length,
        averageResponseTime: Math.round(
          recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length
        ),
        errorRate: Math.round(
          (recentRequests.filter(r => r.status >= 400).length / recentRequests.length) * 100
        ),
      };
    }

    const httpStatus = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503;
    return reply.status(httpStatus).send(status);
  });

  // ============================================
  // READINESS CHECK
  // ============================================

  /**
   * GET /api/ready - Readiness probe
   */
  app.get('/api/ready', async (request, reply) => {
    try {
      // Check database connection
      await app.prisma.$queryRaw`SELECT 1`;

      return {
        ready: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return reply.status(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        error: 'Database connection failed',
      });
    }
  });

  // ============================================
  // LIVENESS CHECK
  // ============================================

  /**
   * GET /api/live - Liveness probe
   */
  app.get('/api/live', async (request, reply) => {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  });

  // ============================================
  // SYSTEM METRICS
  // ============================================

  /**
   * GET /api/metrics - System metrics for monitoring
   */
  app.get('/api/metrics', async (request, reply) => {
    const memUsage = process.memoryUsage();
    const metrics: SystemMetrics = {
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      cpu: { usage: 0 }, // CPU usage requires platform-specific implementation
      uptime: process.uptime(),
      pid: process.pid,
    };

    // Calculate request metrics
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = requestLog.filter(r => r.timestamp > oneMinuteAgo);

    return {
      success: true,
      data: {
        system: metrics,
        requests: {
          last60: {
            count: recentRequests.length,
            avgResponseTime: recentRequests.length > 0
              ? Math.round(recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length)
              : 0,
            errorRate: recentRequests.length > 0
              ? Math.round((recentRequests.filter(r => r.status >= 400).length / recentRequests.length) * 100)
              : 0,
          },
        },
      },
    };
  });

  // ============================================
  // WEBHOOK LOGS (for debugging)
  // ============================================

  /**
   * GET /debug/webhook-logs - Get webhook logs (superadmin only)
   */
  app.get('/debug/webhook-logs', async (request: any, reply) => {
    // This should be protected at superadmin level
    const { page = '1', limit = '50', status } = request.query as any;

    const where: any = {};
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      app.prisma.webhookLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit) || 50,
        skip: (parseInt(page) - 1) * (parseInt(limit) || 50),
      }),
      app.prisma.webhookLog.count({ where }),
    ]);

    return {
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / (parseInt(limit) || 50)),
      },
    };
  });

  // ============================================
  // REQUEST LOGS (for debugging)
  // ============================================

  /**
   * GET /debug/requests - Get recent request logs (superadmin only)
   */
  app.get('/debug/requests', async (request: any, reply) => {
    const since = Date.now() - 60000; // Last minute
    const recentLogs = requestLog.filter(r => r.timestamp > since);

    return {
      success: true,
      data: recentLogs.map(log => ({
        ...log,
        timestamp: new Date(log.timestamp).toISOString(),
      })),
    };
  });

  // ============================================
  // ERROR TRACKING
  // ============================================

  /**
   * POST /errors - Report client-side errors
   */
  app.post('/errors', async (request, reply) => {
    const schema = z.object({
      message: z.string(),
      stack: z.string().optional(),
      component: z.string().optional(),
      userId: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    });

    try {
      const body = schema.parse(request.body);

      // Log the error (in production, send to error tracking service)
      app.log.error({
        type: 'CLIENT_ERROR',
        ...body,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch {
      return reply.status(400).send({ success: false, error: 'Invalid error data' });
    }
  });
}

// Need zod for error reporting
import { z } from 'zod';
