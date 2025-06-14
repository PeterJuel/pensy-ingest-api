-- ============================================================
--  RAG Ingestion · baseline schema  (per-mail logs, no summary)
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
  body            jsonb,                 -- full sanitized JSON
  conversation_id text,
  inserted_at     timestamptz            DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emails_conversation_id_idx
  ON emails (conversation_id);

-- ──────────────────  Pipeline logs  ─────────────────────────
-- one row per e-mail, duplicates included; email_id is NOT NULL
CREATE TABLE IF NOT EXISTS pipeline_logs (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id  uuid NOT NULL REFERENCES emails(id),
  batch_id  uuid,              -- still useful for grouping UI
  step      text,
  status    text,              -- ok | duplicate | error | …
  details   jsonb,
  ts        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_logs_batch_idx
  ON pipeline_logs (batch_id);

-- Placeholder for Graphile Worker schema
CREATE SCHEMA IF NOT EXISTS graphile_worker;
