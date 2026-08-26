-- ============================================================
-- WhatsApp SaaS Platform — Schema Migration
-- Safe to run multiple times (idempotent)
-- Run from the database/ folder:
--   psql "$DATABASE_URL" -f migrate.sql
-- ============================================================

-- 1. Add assignedTeamId to conversations (for team assignment feature)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'assignedTeamId'
  ) THEN
    ALTER TABLE conversations ADD COLUMN "assignedTeamId" TEXT;
  END IF;
END; $$;

-- 2. Add foreign key constraint for assignedTeamId → teams.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'conversations_assignedTeamId_fkey'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT "conversations_assignedTeamId_fkey"
      FOREIGN KEY ("assignedTeamId") REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END; $$;

-- 3. Create conversation_notes table
CREATE TABLE IF NOT EXISTS conversation_notes (
  id             TEXT NOT NULL PRIMARY KEY,
  "tenantId"     TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "authorId"     TEXT,
  content        TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT conversation_notes_conversation_id_fkey
    FOREIGN KEY ("conversationId") REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT conversation_notes_author_id_fkey
    FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Indexes for conversation_notes
CREATE INDEX IF NOT EXISTS conversation_notes_conversation_id_idx
  ON conversation_notes("conversationId");
CREATE INDEX IF NOT EXISTS conversation_notes_tenant_id_idx
  ON conversation_notes("tenantId");

-- Done!
SELECT 'Migration complete' AS status;
