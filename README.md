# WhatsApp Business API SaaS Platform

A complete multi-tenant WhatsApp Business API SaaS platform with Super Admin panel and Client (Tenant) dashboard.

## Features

- **Multi-Tenant Architecture** - PostgreSQL Row-Level Security for tenant isolation
- **Super Admin Panel** - System-wide dashboard, tenant management, billing
- **Client Panel** - Inbox, campaigns, chatbot builder, analytics
- **Role-Based Access Control** - 10 roles, 20+ resources
- **WhatsApp Integration** - Full Meta Cloud API integration
- **Stripe Billing** - Subscription management (mock mode available)
- **Rate Limiting** - Token bucket algorithm with Redis

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Fastify (TypeScript) |
| Frontend | React + Vite + Tailwind CSS |
| Database | PostgreSQL + Prisma ORM |
| Cache | Redis + BullMQ |
| Auth | JWT (access + refresh tokens) |
| Payments | Stripe Billing |
| WhatsApp | Meta WhatsApp Cloud API |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+ (or Docker)
- Redis 7+ (or Docker)

### 1. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Verify services are running
docker-compose ps
```

### 2. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install all dependencies
pnpm install
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and fill in your values
```

### 4. Setup Database

```bash
# Push schema to database
pnpm db:push

# Run seed script (creates demo data)
pnpm db:seed
```

### 5. Start Development Servers

```bash
# Start API server (port 3001)
pnpm dev:api

# Start Web frontend (port 3000)
pnpm dev:web
```

Open http://localhost:3000 in your browser.

## Project Structure

```
whatsapp-saas/
├── apps/
│   ├── api/              # Fastify backend
│   │   ├── src/
│   │   │   ├── routes/   # API route handlers
│   │   │   ├── services/ # Business logic
│   │   │   ├── middleware/
│   │   │   └── index.ts
│   │   └── package.json
│   └── web/              # React frontend
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   └── App.tsx
│       └── package.json
├── packages/
│   ├── config/           # RBAC, plans, guards
│   └── shared/           # Types, utilities
├── database/
│   ├── schema.prisma     # Prisma schema
│   ├── rls/             # Row-Level Security SQL
│   └── seed.ts          # Database seeding
└── docker-compose.yml
```

## Demo Credentials

After running `pnpm db:seed`:

**Super Admin:**
- Email: admin@whatsapp-saas.com
- Password: admin123

**Demo Tenant:**
- Email: owner@demo.com
- Password: demo123

## API Documentation

### Super Admin Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/superadmin/dashboard | Dashboard metrics |
| GET | /api/v1/superadmin/tenants | List all tenants |
| POST | /api/v1/superadmin/tenants | Create tenant |
| PATCH | /api/v1/superadmin/tenants/:id | Update tenant |
| POST | /api/v1/superadmin/tenants/:id/suspend | Suspend tenant |

### Tenant Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/login | User login |
| GET | /api/v1/dashboard | Dashboard metrics |
| GET | /api/v1/contacts | List contacts |
| GET | /api/v1/conversations | List conversations |
| POST | /api/v1/messages/send | Send message |
| POST | /api/v1/campaigns | Create campaign |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /webhook | WhatsApp verification |
| POST | /webhook | WhatsApp events |
| POST | /api/v1/stripe/webhook | Stripe events |

## Pricing Plans

| Plan | Contacts | Messages/Month | Phone #s | Price |
|------|----------|---------------|----------|-------|
| Starter | 500 | 5,000 | 1 | $49/mo |
| Growth | 2,500 | 25,000 | 3 | $149/mo |
| Business | 10,000 | 100,000 | 10 | $399/mo |
| Enterprise | Unlimited | Unlimited | Custom | Custom |

## RBAC Roles

**Platform Level:**
- Super Admin - Full platform access
- Support Admin - Help tenants, no billing
- Finance Admin - Billing management
- Developer - API/webhook management

**Tenant Level:**
- Owner - Full workspace access
- Admin - Workspace except billing cancel
- Manager - Team, campaigns, contacts
- Agent - Reply to conversations
- Viewer - Read-only access
- API User - Programmatic access only

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `WHATSAPP_MOCK_MODE` - Use mock WhatsApp API
- `STRIPE_MOCK_MODE` - Use mock Stripe billing

## Production Deployment

### Docker

```bash
# Build production images
docker build -t whatsapp-saas-api ./apps/api
docker build -t whatsapp-saas-web ./apps/web

# Run with production docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### Manual

```bash
# Build
pnpm build

# Run migrations
pnpm db:migrate

# Start API
pnpm start:api

# Start Web (static hosting)
pnpm start:web
```

## License

MIT
