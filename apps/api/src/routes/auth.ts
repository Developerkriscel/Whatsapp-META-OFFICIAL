// AUTH ROUTES -- Login, Register, Refresh, Logout

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateTokens, createAuditLog } from '../middleware/auth.js';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  tenantName: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * Register auth routes
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    // Check if user is a tenant user
    const user = await app.prisma.user.findFirst({
      where: { email: body.email },
      include: { tenant: { include: { plan: true } } },
    });

    if (user) {
      // Tenant user login
      const validPassword = await bcrypt.compare(body.password, user.password);
      if (!validPassword) {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      if (!user.isActive) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCOUNT_DISABLED', message: 'Your account has been disabled' },
        });
      }

      // Update last login
      await app.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const tokens = await generateTokens(app, {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        isSuperadmin: false,
      });

      // Create audit log
      await createAuditLog(app.prisma, {
        actorId: user.id,
        actorType: 'user',
        actorRole: user.role,
        action: 'LOGIN',
        resource: 'auth',
        tenantId: user.tenantId,
        userId: user.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
            tenantName: user.tenant.name,
            avatarUrl: user.avatarUrl,
          },
          ...tokens,
        },
      };
    }

    // Check if superadmin
    const superadmin = await app.prisma.superadmin.findUnique({
      where: { email: body.email },
    });

    if (superadmin) {
      const validPassword = await bcrypt.compare(body.password, superadmin.password);
      if (!validPassword) {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      if (!superadmin.isActive) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCOUNT_DISABLED', message: 'Your account has been disabled' },
        });
      }

      const tokens = await generateTokens(app, {
        id: superadmin.id,
        email: superadmin.email,
        role: superadmin.role,
        superadminId: superadmin.id,
        isSuperadmin: true,
      });

      return {
        success: true,
        data: {
          user: {
            id: superadmin.id,
            email: superadmin.email,
            name: superadmin.name,
            role: superadmin.role,
            isSuperadmin: true,
          },
          ...tokens,
        },
      };
    }

    return reply.status(401).send({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  });

  // Register (create new tenant + owner user)
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    // Check if email already exists
    const existingUser = await app.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: '', email: body.email } },
    });

    // Check for superadmin too
    const existingSuperadmin = await app.prisma.superadmin.findUnique({
      where: { email: body.email },
    });

    if (existingUser || existingSuperadmin) {
      return reply.status(409).send({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
      });
    }

    // Get starter plan
    const starterPlan = await app.prisma.plan.findUnique({
      where: { tier: 'STARTER' },
    });

    if (!starterPlan) {
      return reply.status(500).send({
        success: false,
        error: { code: 'PLAN_NOT_FOUND', message: 'Starter plan not found' },
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(body.password, 12);

    // Create tenant and owner user in transaction
    const result = await app.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.tenantName || `${body.name}'s Workspace`,
          status: 'TRIAL',
          planId: starterPlan.id,
          isOnTrial: true,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          timezone: 'UTC',
          defaultLanguage: 'en',
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: body.email,
          name: body.name,
          password: hashedPassword,
          role: 'OWNER',
          isActive: true,
          isVerified: false,
        },
      });

      return { tenant, user };
    });

    // Generate tokens
    const tokens = await generateTokens(app, {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      tenantId: result.tenant.id,
      isSuperadmin: false,
    });

    return reply.status(201).send({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          tenantId: result.tenant.id,
          tenantName: result.tenant.name,
        },
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          status: result.tenant.status,
          trialEndsAt: result.tenant.trialEndsAt,
        },
        ...tokens,
      },
    });
  });

  // Refresh token
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    // Find valid refresh token
    const refreshToken = await app.prisma.refreshToken.findFirst({
      where: {
        token: body.refreshToken,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!refreshToken) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' },
      });
    }

    // Get user
    const user = await app.prisma.user.findUnique({
      where: { id: refreshToken.userId },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found or inactive' },
      });
    }

    // Generate new tokens
    const tokens = await generateTokens(app, {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      isSuperadmin: false,
    });

    // Revoke old refresh token and create new one
    await app.prisma.$transaction([
      app.prisma.refreshToken.update({
        where: { id: refreshToken.id },
        data: { revokedAt: new Date() },
      }),
      app.prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          tokenHash: tokens.refreshToken, // In production, hash this
          userId: user.id,
          tenantId: user.tenantId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      }),
    ]);

    return {
      success: true,
      data: tokens,
    };
  });

  // Logout
  app.post('/logout', async (request, reply) => {
    if (request.authUser) {
      // Revoke all refresh tokens for this user
      await app.prisma.refreshToken.updateMany({
        where: { userId: request.authUser.id },
        data: { revokedAt: new Date() },
      });
      await createAuditLog(app.prisma, {
        actorId: request.authUser.id,
        actorType: 'user',
        actorRole: request.authUser.role,
        action: 'LOGOUT',
        resource: 'auth',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        tenantId: request.authUser.tenantId,
      });
    }
    return { success: true, data: { message: 'Logged out successfully' } };
  });

  // Forgot password
  app.post('/forgot-password', async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);

    const user = await app.prisma.user.findFirst({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        data: { message: 'If an account exists with this email, a password reset link has been sent' },
      };
    }

    // Generate reset token
    const { randomBytes } = await import('crypto');
    const token = randomBytes(32).toString('hex');
    const tokenHash = token.slice(0, 16); // Store prefix for lookup
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await (app.prisma as any).passwordReset.create({
      data: { userId: user.id, token, tokenHash, expiresAt },
    });

    // In production: send email with reset link containing the token
    // For now log it to server console
    console.log(`[Password Reset] For ${email}: ${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`);

    return {
      success: true,
      data: {
        message: 'If an account exists with this email, a password reset link has been sent',
        // DEV ONLY — remove in production:
        devToken: token,
      },
    };
  });

  // Reset password
  app.post('/reset-password', async (request, reply) => {
    const { token, password } = z.object({
      token: z.string().min(1),
      password: z.string().min(8),
    }).parse(request.body);

    // Find valid reset token
    const reset = await (app.prisma as any).passwordReset.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
    });

    if (!reset) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Reset token is invalid or has expired' },
      });
    }

    // Hash new password and update user
    const hashedPassword = await bcrypt.hash(password, 12);
    await app.prisma.user.update({
      where: { id: reset.userId },
      data: { password: hashedPassword },
    });

    // Mark token as used
    await (app.prisma as any).passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });

    // Revoke all existing sessions for this user
    await app.prisma.refreshToken.updateMany({
      where: { userId: reset.userId },
      data: { revokedAt: new Date() },
    });

    return { success: true, data: { message: 'Password reset successfully. Please log in with your new password.' } };
  });

  // ============================================
  // USER PROFILE
  // ============================================

  // GET /auth/me — Get current user profile
  app.get('/me', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: request.authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
        isVerified: true,
        lastLoginAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            timezone: true,
            defaultLanguage: true,
          },
        },
      },
    });

    return { success: true, data: user };
  });

  // PATCH /auth/me — Update current user profile
  app.patch('/me', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8).optional(),
    }).parse(request.body);

    // If changing password, verify current password
    if (body.newPassword) {
      if (!body.currentPassword) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_PASSWORD', message: 'Current password is required to change password' },
        });
      }

      const user = await app.prisma.user.findUnique({ where: { id: request.authUser.id } });
      if (!user) {
        return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND' } });
      }

      const bcrypt = await import('bcryptjs');
      const valid = await bcrypt.compare(body.currentPassword, user.password);
      if (!valid) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
        });
      }
    }

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.email) updateData.email = body.email;
    if (body.phone) updateData.phone = body.phone;
    if (body.newPassword) {
      const bcrypt = await import('bcryptjs');
      updateData.password = await bcrypt.hash(body.newPassword, 12);
    }

    const updated = await app.prisma.user.update({
      where: { id: request.authUser.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    return { success: true, data: updated };
  });

  // ============================================
  // SESSIONS MANAGEMENT
  // ============================================

  // GET /auth/sessions — List active sessions
  app.get('/sessions', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Return mock session data (in production, query from database)
    const sessions = [
      {
        id: 'current-session',
        ipAddress: '127.0.0.1',
        userAgent: request.headers['user-agent'] || 'Unknown',
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        isCurrent: true,
      },
      {
        id: 'session-2',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
        createdAt: new Date(Date.now() - 604800000).toISOString(),
        isCurrent: false,
      },
    ];

    return { success: true, data: sessions };
  });

  // DELETE /auth/sessions/:sessionId — Revoke a session
  app.delete('/sessions/:sessionId', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);

    // In production, delete from database
    // await app.prisma.userSession.deleteMany({ where: { id: sessionId, userId: request.authUser.id } });

    return { success: true, data: { revoked: true, sessionId } };
  });

  // DELETE /auth/sessions — Revoke all sessions except current
  app.delete('/sessions', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // In production, delete from database
    // await app.prisma.userSession.deleteMany({ where: { userId: request.authUser.id } });

    return { success: true, data: { revoked: true, count: 1 } };
  });

  // ============================================
  // TWO-FACTOR AUTHENTICATION
  // ============================================

  // GET /auth/2fa/status — Get 2FA status
  app.get('/2fa/status', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: request.authUser.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    return {
      success: true,
      data: {
        enabled: user?.twoFactorEnabled || false,
        secret: user?.twoFactorSecret ? '******' : null,
      },
    };
  });

  // POST /auth/2fa/setup — Generate 2FA secret
  app.post('/2fa/setup', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Generate a random secret (in production, use speakeasy or similar)
    const secret = Buffer.from(Math.random().toString(36).substring(2) + Date.now().toString(36)).toString('base64').substring(0, 16);

    // Store secret temporarily (not enabled yet)
    await app.prisma.user.update({
      where: { id: request.authUser.id },
      data: { twoFactorSecret: secret },
    });

    // Generate QR code URL (users would scan with authenticator app)
    const qrCodeUrl = `otpauth://totp/WhatsApp:${request.authUser.email}?secret=${secret}&issuer=WhatsApp`;

    return {
      success: true,
      data: {
        secret,
        qrCodeUrl,
        manualEntry: secret.toUpperCase().match(/.{1,4}/g)?.join(' ') || secret,
      },
    };
  });

  // POST /auth/2fa/enable — Enable 2FA with verification code
  app.post('/2fa/enable', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { code } = z.object({
      code: z.string().length(6),
    }).parse(request.body);

    const user = await app.prisma.user.findUnique({
      where: { id: request.authUser.id },
    });

    if (!user?.twoFactorSecret) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_SECRET', message: 'Please setup 2FA first' },
      });
    }

    // In production, verify the TOTP code here
    // For demo, accept any 6-digit code
    if (code.length !== 6) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
      });
    }

    await app.prisma.user.update({
      where: { id: request.authUser.id },
      data: { twoFactorEnabled: true },
    });

    return { success: true, data: { enabled: true } };
  });

  // POST /auth/2fa/disable — Disable 2FA
  app.post('/2fa/disable', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { password } = z.object({
      password: z.string().min(1),
    }).parse(request.body);

    const user = await app.prisma.user.findUnique({
      where: { id: request.authUser.id },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND' } });
    }

    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Incorrect password' },
      });
    }

    await app.prisma.user.update({
      where: { id: request.authUser.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return { success: true, data: { enabled: false } };
  });

  // ============================================
  // NOTIFICATION PREFERENCES
  // ============================================

  // GET /settings/notifications — Get notification preferences
  app.get('/settings/notifications', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Check for tenant notification settings
    let settings = await app.prisma.tenantSetting.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    // Return defaults if no settings exist
    if (!settings) {
      return {
        success: true,
        data: {
          emailNewMessages: true,
          emailDeliveryReports: true,
          emailWeeklyDigest: false,
          emailBillingAlerts: true,
          browserNotifications: true,
          smsAlerts: false,
        },
      };
    }

    return {
      success: true,
      data: {
        emailNewMessages: settings.emailNotifications ?? true,
        emailDeliveryReports: settings.deliveryReports ?? true,
        emailWeeklyDigest: settings.weeklyDigest ?? false,
        emailBillingAlerts: settings.billingAlerts ?? true,
        browserNotifications: settings.browserNotifications ?? true,
        smsAlerts: settings.smsNotifications ?? false,
      },
    };
  });

  // PATCH /settings/notifications — Update notification preferences
  app.patch('/settings/notifications', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      emailNewMessages: z.boolean().optional(),
      emailDeliveryReports: z.boolean().optional(),
      emailWeeklyDigest: z.boolean().optional(),
      emailBillingAlerts: z.boolean().optional(),
      browserNotifications: z.boolean().optional(),
      smsAlerts: z.boolean().optional(),
    }).parse(request.body);

    const updateData: any = {};
    if (body.emailNewMessages !== undefined) updateData.emailNotifications = body.emailNewMessages;
    if (body.emailDeliveryReports !== undefined) updateData.deliveryReports = body.emailDeliveryReports;
    if (body.emailWeeklyDigest !== undefined) updateData.weeklyDigest = body.emailWeeklyDigest;
    if (body.emailBillingAlerts !== undefined) updateData.billingAlerts = body.emailBillingAlerts;
    if (body.browserNotifications !== undefined) updateData.browserNotifications = body.browserNotifications;
    if (body.smsAlerts !== undefined) updateData.smsNotifications = body.smsAlerts;

    const settings = await app.prisma.tenantSetting.upsert({
      where: { tenantId: request.authUser.tenantId },
      create: { tenantId: request.authUser.tenantId, ...updateData },
      update: updateData,
    });

    return { success: true, data: settings };
  });

  // ============================================
  // SECURITY SETTINGS
  // ============================================

  // GET /settings/security — Get security settings
  app.get('/settings/security', async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: request.authUser.id },
      select: {
        twoFactorEnabled: true,
        lastLoginAt: true,
      },
    });

    return {
      success: true,
      data: {
        twoFactorEnabled: user?.twoFactorEnabled || false,
        lastLogin: user?.lastLoginAt,
      },
    };
  });
}
