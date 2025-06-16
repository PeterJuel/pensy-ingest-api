-- migrations/002_pipeline_status.sql

-- ──────────────────  Email Processing Status  ──────────────────
-- Tracks the overall processing state of each email
CREATE TABLE IF NOT EXISTS email_processing_status (
  email_id uuid PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial_failure')),
  current_step text,
  completed_steps text[], -- Array of completed step names
  failed_steps text[],    -- Array of failed step names
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_processing_status_status_idx
  ON email_processing_status (status);

CREATE INDEX IF NOT EXISTS email_processing_status_updated_idx
  ON email_processing_status (updated_at);

-- Function to automatically update completed_steps and failed_steps arrays
CREATE OR REPLACE FUNCTION update_processing_steps()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the email_processing_status when pipeline_logs are inserted
  IF TG_OP = 'INSERT' AND NEW.step IS NOT NULL THEN
    INSERT INTO email_processing_status (email_id, status, current_step)
    VALUES (NEW.email_id, 'processing', NEW.step)
    ON CONFLICT (email_id) DO UPDATE SET
      current_step = NEW.step,
      completed_steps = CASE 
        WHEN NEW.status = 'ok' THEN 
          array_append(
            array_remove(COALESCE(email_processing_status.completed_steps, '{}'), NEW.step),
            NEW.step
          )
        ELSE email_processing_status.completed_steps
      END,
      failed_steps = CASE 
        WHEN NEW.status = 'error' THEN 
          array_append(
            array_remove(COALESCE(email_processing_status.failed_steps, '{}'), NEW.step),
            NEW.step
          )
        ELSE email_processing_status.failed_steps
      END,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update step arrays
DROP TRIGGER IF EXISTS update_processing_steps_trigger ON pipeline_logs;
CREATE TRIGGER update_processing_steps_trigger
  AFTER INSERT ON pipeline_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_processing_steps();

-- ──────────────────  Enhanced Indexes  ──────────────────────────
-- Additional indexes for better performance with the new orchestrator

-- For pipeline step dependency queries
CREATE INDEX IF NOT EXISTS pipeline_logs_email_step_status_idx
  ON pipeline_logs (email_id, step, status);

-- For pipeline analytics
CREATE INDEX IF NOT EXISTS pipeline_logs_step_ts_idx
  ON pipeline_logs (step, ts);

-- For email outputs queries by type
CREATE INDEX IF NOT EXISTS email_outputs_type_created_idx
  ON email_outputs (output_type, created_at);

-- Composite index for finding latest output per type
CREATE INDEX IF NOT EXISTS email_outputs_email_type_created_idx
  ON email_outputs (email_id, output_type, created_at DESC);

-- ──────────────────  Pipeline Analytics Views  ───────────────────
-- Convenient views for pipeline monitoring

CREATE OR REPLACE VIEW pipeline_step_summary AS
SELECT 
  step,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE status = 'ok') as successful_executions,
  COUNT(*) FILTER (WHERE status = 'error') as failed_executions,
  COUNT(*) FILTER (WHERE status = 'duplicate') as duplicate_executions,
  ROUND(AVG(CAST(details->>'duration' AS numeric)), 2) as avg_duration_ms,
  MIN(ts) as first_execution,
  MAX(ts) as last_execution
FROM pipeline_logs 
WHERE ts > now() - interval '7 days'
GROUP BY step
ORDER BY step;

CREATE OR REPLACE VIEW email_processing_summary AS
SELECT 
  eps.status,
  COUNT(*) as email_count,
  AVG(EXTRACT(EPOCH FROM (eps.updated_at - eps.started_at))) as avg_processing_time_seconds,
  MIN(eps.started_at) as oldest_started,
  MAX(eps.updated_at) as newest_updated
FROM email_processing_status eps
GROUP BY eps.status
ORDER BY eps.status;

-- View for emails stuck in processing
CREATE OR REPLACE VIEW stuck_emails AS
SELECT 
  eps.email_id,
  e.subject,
  eps.status,
  eps.current_step,
  eps.started_at,
  eps.updated_at,
  EXTRACT(EPOCH FROM (now() - eps.updated_at))/60 as minutes_since_update
FROM email_processing_status eps
JOIN emails e ON e.id = eps.email_id
WHERE eps.status = 'processing' 
  AND eps.updated_at < now() - interval '30 minutes'
ORDER BY eps.updated_at;