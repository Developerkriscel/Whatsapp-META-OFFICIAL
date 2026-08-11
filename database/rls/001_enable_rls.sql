-- PostgreSQL Row-Level Security (RLS)
-- Enable tenant isolation at the database engine level
-- Every tenant-scoped table gets RLS policies

-- ============================================
-- Enable RLS on all tenant tables
-- ============================================

-- Users table
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "phone_numbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bot_flows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_flows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_addons" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get current tenant ID from app settings
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::TEXT;
$$ LANGUAGE SQL STABLE;

-- Function to check if current session is superadmin
CREATE OR REPLACE FUNCTION is_superadmin_session()
RETURNS BOOLEAN AS $$
  SELECT NULLIF(current_setting('app.is_superadmin', true), '')::BOOLEAN = TRUE;
$$ LANGUAGE SQL STABLE;

-- Function to get current user ID
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::TEXT;
$$ LANGUAGE SQL STABLE;

-- ============================================
-- Users Policies
-- ============================================

CREATE POLICY users_tenant_select ON "users" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY users_tenant_insert ON "users" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY users_tenant_update ON "users" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY users_tenant_delete ON "users" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Contacts Policies
-- ============================================

CREATE POLICY contacts_tenant_select ON "contacts" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY contacts_tenant_insert ON "contacts" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY contacts_tenant_update ON "contacts" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY contacts_tenant_delete ON "contacts" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Conversations Policies
-- ============================================

CREATE POLICY conversations_tenant_select ON "conversations" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY conversations_tenant_insert ON "conversations" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY conversations_tenant_update ON "conversations" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY conversations_tenant_delete ON "conversations" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Messages Policies
-- ============================================

CREATE POLICY messages_tenant_select ON "messages" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY messages_tenant_insert ON "messages" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY messages_tenant_update ON "messages" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY messages_tenant_delete ON "messages" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Phone Numbers Policies
-- ============================================

CREATE POLICY phone_numbers_tenant_select ON "phone_numbers" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY phone_numbers_tenant_insert ON "phone_numbers" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY phone_numbers_tenant_update ON "phone_numbers" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY phone_numbers_tenant_delete ON "phone_numbers" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Templates Policies
-- ============================================

CREATE POLICY templates_tenant_select ON "templates" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY templates_tenant_insert ON "templates" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY templates_tenant_update ON "templates" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY templates_tenant_delete ON "templates" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Campaigns Policies
-- ============================================

CREATE POLICY campaigns_tenant_select ON "campaigns" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY campaigns_tenant_insert ON "campaigns" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY campaigns_tenant_update ON "campaigns" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY campaigns_tenant_delete ON "campaigns" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Bot Flows Policies
-- ============================================

CREATE POLICY bot_flows_tenant_select ON "bot_flows" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY bot_flows_tenant_insert ON "bot_flows" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY bot_flows_tenant_update ON "bot_flows" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY bot_flows_tenant_delete ON "bot_flows" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Tags Policies
-- ============================================

CREATE POLICY tags_tenant_select ON "tags" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tags_tenant_insert ON "tags" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tags_tenant_update ON "tags" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tags_tenant_delete ON "tags" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Segments Policies
-- ============================================

CREATE POLICY segments_tenant_select ON "segments" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY segments_tenant_insert ON "segments" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY segments_tenant_update ON "segments" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY segments_tenant_delete ON "segments" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Contact Tags Policies
-- ============================================

CREATE POLICY contact_tags_tenant_select ON "contact_tags" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "contacts" c
      WHERE c.id = contact_tags.contact_id
      AND c.tenant_id::TEXT = get_current_tenant_id()
    )
  );

CREATE POLICY contact_tags_tenant_insert ON "contact_tags" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "contacts" c
      WHERE c.id = contact_tags.contact_id
      AND c.tenant_id::TEXT = get_current_tenant_id()
    )
  );

CREATE POLICY contact_tags_tenant_delete ON "contact_tags" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "contacts" c
      WHERE c.id = contact_tags.contact_id
      AND c.tenant_id::TEXT = get_current_tenant_id()
    )
  );

-- ============================================
-- Contact Segments Policies
-- ============================================

CREATE POLICY contact_segments_tenant_select ON "contact_segments" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "contacts" c
      WHERE c.id = contact_segments.contact_id
      AND c.tenant_id::TEXT = get_current_tenant_id()
    )
  );

CREATE POLICY contact_segments_tenant_insert ON "contact_segments" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "contacts" c
      WHERE c.id = contact_segments.contact_id
      AND c.tenant_id::TEXT = get_current_tenant_id()
    )
  );

CREATE POLICY contact_segments_tenant_delete ON "contact_segments" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "contacts" c
      WHERE c.id = contact_segments.contact_id
      AND c.tenant_id::TEXT = get_current_tenant_id()
    )
  );

-- ============================================
-- API Keys Policies
-- ============================================

CREATE POLICY api_keys_tenant_select ON "api_keys" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY api_keys_tenant_insert ON "api_keys" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY api_keys_tenant_update ON "api_keys" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY api_keys_tenant_delete ON "api_keys" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Invoices Policies
-- ============================================

CREATE POLICY invoices_tenant_select ON "invoices" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY invoices_tenant_insert ON "invoices" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY invoices_tenant_update ON "invoices" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY invoices_tenant_delete ON "invoices" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- WhatsApp Flows Policies
-- ============================================

CREATE POLICY whatsapp_flows_tenant_select ON "whatsapp_flows" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY whatsapp_flows_tenant_insert ON "whatsapp_flows" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY whatsapp_flows_tenant_update ON "whatsapp_flows" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY whatsapp_flows_tenant_delete ON "whatsapp_flows" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Tickets Policies
-- ============================================

CREATE POLICY tickets_tenant_select ON "tickets" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tickets_tenant_insert ON "tickets" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tickets_tenant_update ON "tickets" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tickets_tenant_delete ON "tickets" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Ticket Messages Policies
-- ============================================

CREATE POLICY ticket_messages_tenant_select ON "ticket_messages" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "tickets" t
      WHERE t.id = ticket_messages.ticket_id
      AND t.tenant_id::TEXT = get_current_tenant_id()
    )
  );

CREATE POLICY ticket_messages_tenant_insert ON "ticket_messages" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR EXISTS (
      SELECT 1 FROM "tickets" t
      WHERE t.id = ticket_messages.ticket_id
      AND t.tenant_id::TEXT = get_current_tenant_id()
    )
  );

-- ============================================
-- Audit Logs Policies
-- ============================================

CREATE POLICY audit_logs_tenant_select ON "audit_logs" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY audit_logs_tenant_insert ON "audit_logs" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- User Sessions Policies
-- ============================================

CREATE POLICY user_sessions_tenant_select ON "user_sessions" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY user_sessions_tenant_insert ON "user_sessions" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY user_sessions_tenant_update ON "user_sessions" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY user_sessions_tenant_delete ON "user_sessions" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Refresh Tokens Policies
-- ============================================

CREATE POLICY refresh_tokens_tenant_select ON "refresh_tokens" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY refresh_tokens_tenant_insert ON "refresh_tokens" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY refresh_tokens_tenant_update ON "refresh_tokens" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY refresh_tokens_tenant_delete ON "refresh_tokens" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Tenant Addons Policies
-- ============================================

CREATE POLICY tenant_addons_tenant_select ON "tenant_addons" FOR SELECT
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tenant_addons_tenant_insert ON "tenant_addons" FOR INSERT
  WITH CHECK (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tenant_addons_tenant_update ON "tenant_addons" FOR UPDATE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

CREATE POLICY tenant_addons_tenant_delete ON "tenant_addons" FOR DELETE
  USING (
    is_superadmin_session() = TRUE
    OR tenant_id::TEXT = get_current_tenant_id()
  );

-- ============================================
-- Performance Indexes
-- ============================================

-- Tenant-based indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON "users"("tenant_id", "email");
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON "contacts"("tenant_id", "phone");
CREATE INDEX IF NOT EXISTS idx_messages_tenant_conv ON "messages"("tenant_id", "conversation_id");
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_contact ON "conversations"("tenant_id", "contact_id");
CREATE INDEX IF NOT EXISTS idx_messages_meta_id ON "messages"("meta_message_id");
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON "audit_logs"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON "user_sessions"("user_id");
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON "refresh_tokens"("user_id");
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON "refresh_tokens"("token");

-- Status-based indexes for common queries
CREATE INDEX IF NOT EXISTS idx_conversations_status ON "conversations"("status");
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON "conversations"("assigned_to_id");
CREATE INDEX IF NOT EXISTS idx_messages_status ON "messages"("status");
CREATE INDEX IF NOT EXISTS idx_messages_created ON "messages"("created_at");
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON "campaigns"("status");
CREATE INDEX IF NOT EXISTS idx_tickets_status ON "tickets"("status");

-- ============================================
-- Notes
-- ============================================
-- Superadmin bypass: The application user must have SET permissions
-- to configure RLS context. In your application:
--   await prisma.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`;
--   await prisma.$executeRaw`SET LOCAL app.is_superadmin = true`; // for superadmins
