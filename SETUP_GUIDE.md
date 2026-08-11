# WhatsApp SaaS Platform - Complete Setup Guide

## 🎯 Project Status: Production Ready

A complete multi-tenant WhatsApp Business API SaaS with full Stripe billing integration.

---

## 📋 What's Included

### Backend (Fastify API)
- ✅ JWT Authentication with refresh tokens
- ✅ Multi-tenant PostgreSQL with Row-Level Security
- ✅ 10 RBAC roles, 22 resources
- ✅ WhatsApp Cloud API integration (mock mode available)
- ✅ **Stripe Billing** — Checkout, subscriptions, webhooks
- ✅ **PDF Invoice generation** with pdfkit
- ✅ **Add-ons system** (extra phone, contacts, messages, AI, white label, priority support)
- ✅ Rate limiting (token bucket, Redis)
- ✅ Audit logging
- ✅ 60+ API routes

### Frontend (React)
- ✅ Login / Auth flow
- ✅ **Public Pricing Page** — `/pricing`
- ✅ **Client Panel** — Inbox, contacts, campaigns, team, settings
- ✅ **Billing Page** — Plans, usage, invoices, add-ons, PDF download
- ✅ **Super Admin Panel** — Tenants, tickets, **billing analytics**
- ✅ Responsive design with Tailwind CSS
- ✅ Real-time updates with React Query

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Install Stripe CLI (for webhooks)
stripe login
stripe listen --forward-to localhost:3001/api/v1/stripe/webhook

# 3. Push database schema to Neon
pnpm db:push

# 4. Seed demo data
pnpm db:seed

# 5. Create Stripe products
pnpm stripe:setup
# Copy the price IDs to your .env file

# 6. Start dev servers
pnpm dev

# 7. Visit http://localhost:3000
```

---

## 🔐 Demo Credentials

| Role | Email | Password |
|------|-------|---------|
| **Super Admin** | admin@whatsapp-saas.com | admin123 |
| **Tenant Owner** | owner@demo.com | demo123 |
| **Tenant Agent** | agent1@demo.com | demo123 |

---

## 💳 Stripe Test Cards

| Card | Result |
|------|--------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Card declined |
| 4000 0027 6000 3184 | Requires authentication |

Use any future expiry date and any 3-digit CVC.

---

## 📁 Project Structure

```
whatsapp-saas/
├── apps/
│   ├── api/                          # Fastify backend
│   │   ├── src/
│   │   │   ├── app.ts                # Main app
│   │   │   ├── middleware/           # auth, rate-limit
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── tenant.ts
│   │   │   │   ├── superadmin.ts
│   │   │   │   ├── billing.ts
│   │   │   │   ├── invoice.ts
│   │   │   │   ├── tenant-addons.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   └── stripe-webhook.ts
│   │   │   └── services/
│   │   │       ├── stripe.ts
│   │   │       └── invoice.ts
│   │   └── package.json
│   │
│   └── web/                          # React frontend
│       └── src/pages/
│           ├── LoginPage.tsx
│           ├── PricingPage.tsx       # Public
│           ├── DashboardPage.tsx
│           ├── ContactsPage.tsx
│           ├── ConversationsPage.tsx
│           ├── CampaignsPage.tsx
│           ├── TeamPage.tsx
│           ├── BillingPage.tsx       # Includes add-ons
│           ├── SettingsPage.tsx
│           ├── SuperAdminDashboard.tsx
│           ├── SuperAdminTenants.tsx
│           ├── SuperAdminTickets.tsx
│           └── BillingAnalyticsPage.tsx  # Revenue, churn, etc.
│
├── database/
│   ├── schema.prisma                 # 25 models
│   ├── seed.ts                       # Demo data
│   └── rls/001_enable_rls.sql        # Row-Level Security
│
├── packages/
│   ├── config/                       # RBAC, plans, guards
│   └── shared/                       # Types, utils
│
└── scripts/
    └── create-stripe-products.ts     # Auto-create products
```

---

## 🌐 Available Routes

### Public
- `GET /` — Login (or redirect to dashboard)
- `GET /pricing` — Public pricing page
- `GET /register` — Register new tenant

### Tenant (Authenticated)
- `GET /` — Dashboard
- `GET /contacts` — Contacts list
- `GET /conversations` — Inbox
- `GET /campaigns` — Campaigns
- `GET /team` — Team management
- `GET /billing` — Subscription, usage, invoices, add-ons
- `GET /settings` — Workspace settings

### Super Admin
- `GET /superadmin` — Platform dashboard
- `GET /superadmin/tenants` — Tenant management
- `GET /superadmin/billing` — Revenue, churn, analytics
- `GET /superadmin/tickets` — Support tickets

---

## 💰 Stripe Webhook Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate subscription |
| `customer.subscription.created` | Sync new subscription |
| `customer.subscription.updated` | Update plan |
| `customer.subscription.deleted` | Mark as churned |
| `invoice.paid` | Save invoice, reactivate tenant |
| `invoice.payment_failed` | Mark invoice as failed |

---

## 🛠️ Customization

### Change Company Name
1. Edit `apps/web/src/components/Layout.tsx`
2. Edit `apps/api/src/services/invoice.ts` (PDF template)
3. Edit email templates (TODO)

### Add Custom Plan
1. Add plan in `database/seed.ts`
2. Add price in Stripe
3. Update `packages/config/src/plans.ts`

### Custom Email Templates
- TODO: Add email service (Resend / SendGrid)
- Edit `apps/api/src/services/email.ts` (TODO)

---

## 🚢 Deployment

### Frontend → Vercel
```bash
cd apps/web
vercel deploy
```

### Backend → Railway
```bash
cd apps/api
railway up
```

### Database → Already on Neon ☁️

### Redis → Upstash
1. Sign up at [upstash.com](https://upstash.com)
2. Create Redis database
3. Copy connection URL to `REDIS_URL`

---

## 📞 WhatsApp Setup (Optional)

For real WhatsApp messaging (instead of mock mode):

1. Apply for [Meta WhatsApp Business API](https://business.facebook.com/wa/manage/home/)
2. Get credentials:
   - App ID
   - App Secret
   - Access Token
   - Phone Number ID
   - WABA ID
3. Update `.env`:
   ```env
   META_APP_ID=...
   META_ACCESS_TOKEN=...
   META_PHONE_NUMBER_ID=...
   WHATSAPP_MOCK_MODE=false
   ```

---

## 🎉 You're Done!

Visit [http://localhost:3000/pricing](http://localhost:3000/pricing) to see the public pricing page,
or [http://localhost:3000](http://localhost:3000) to log in.

**Enjoy your WhatsApp SaaS platform!** 🚀