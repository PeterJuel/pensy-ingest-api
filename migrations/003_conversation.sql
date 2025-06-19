-- migrations/003_conversation.sql
-- Add conversation_outputs table for aggregated conversation data

-- ──────────────────  Conversation Outputs  ─────────────────────────
-- Stores aggregated conversation data combining multiple emails
CREATE TABLE IF NOT EXISTS conversation_outputs (
  id              uuid PRIMARY KEY       DEFAULT uuid_generate_v4(),
  conversation_id text NOT NULL UNIQUE,  -- The conversation ID from emails (unique per conversation)
  content         jsonb,                 -- the aggregated conversation content
  summary         text,                  -- LLM-generated summary (added later by summary step)
  metadata        jsonb,                 -- processing metadata (email count, date range, etc.)
  pipeline_version text                  DEFAULT 'v1',
  created_at      timestamptz            DEFAULT now(),
  updated_at      timestamptz            DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_outputs_conversation_id_idx
  ON conversation_outputs (conversation_id);

CREATE INDEX IF NOT EXISTS conversation_outputs_created_idx
  ON conversation_outputs (created_at);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_outputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_outputs_update_trigger
  BEFORE UPDATE ON conversation_outputs
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_outputs_updated_at();