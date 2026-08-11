import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
declare module 'fastify' {
    interface FastifyInstance {
        prisma: PrismaClient;
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requirePermission: (resource: string, action: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireOwner: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
export declare function buildApp(): Promise<FastifyInstance>;
export type { FastifyInstance };
//# sourceMappingURL=app.d.ts.map