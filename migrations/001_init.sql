-- ============================================================
--  RAG Ingestion · Updated schema with email_outputs table
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────  Emails  ────────────────────────────────
CREATE TABLE IF NOT EXISTS emails (
  id              uuid PRIMARY KEY       DEFAULT uuid_generate_v4(),
  source_id       text UNIQUE NOT NULL,  -- internetMessageId
  received_at     timestamptz,
  subject         text,                  -- PII-scrubbed
  meta            jsonb,
  body            jsonb,                 -- PII-scrubbed content (source for reprocessing)
  conversation_id text,
  inserted_at     timestamptz            DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emails_conversation_id_idx
  ON emails (conversation_id);

-- ──────────────────  Email Outputs  ─────────────────────────
-- Stores all derived/processed outputs from pipeline steps
CREATE TABLE IF NOT EXISTS email_outputs (
  id              uuid PRIMARY KEY       DEFAULT uuid_generate_v4(),
  email_id        uuid NOT NULL          REFERENCES emails(id) ON DELETE CASCADE,
  output_type     text NOT NULL,         -- 'plain_text', 'summary', 'category', 'chunks', etc.
  content         jsonb,                 -- the actual processed content
  metadata        jsonb,                 -- processing metadata (confidence, timing, model used, etc.)
  pipeline_version text                  DEFAULT 'v1',
  created_at      timestamptz            DEFAULT now(),
  
  -- Ensure one output per type per version per email
  UNIQUE(email_id, output_type, pipeline_version)
);

CREATE INDEX IF NOT EXISTS email_outputs_email_id_idx
  ON email_outputs (email_id);

CREATE INDEX IF NOT EXISTS email_outputs_type_idx  
  ON email_outputs (output_type);

-- ──────────────────  Pipeline logs  ─────────────────────────
-- one row per e-mail, duplicates included; email_id is NOT NULL
CREATE TABLE IF NOT EXISTS pipeline_logs (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id  uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  batch_id  uuid,              -- still useful for grouping UI
  step      text,
  status    text,              -- ok | duplicate | error | …
  details   jsonb,
  ts        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_logs_batch_idx
  ON pipeline_logs (batch_id);

CREATE INDEX IF NOT EXISTS pipeline_logs_email_id_idx
  ON pipeline_logs (email_id);

-- ──────────────────  Graphile Worker Schema  ────────────────
CREATE SCHEMA IF NOT EXISTS graphile_worker;

-- For pipeline step filtering and analytics
CREATE INDEX CONCURRENTLY email_outputs_created_at_idx 
  ON email_outputs (created_at);

CREATE INDEX CONCURRENTLY pipeline_logs_step_status_idx 
  ON pipeline_logs (step, status);

-- For conversation threading queries
CREATE INDEX CONCURRENTLY emails_conversation_received_idx 
  ON emails (conversation_id, received_at);