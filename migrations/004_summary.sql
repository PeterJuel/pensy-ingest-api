-- migrations/004_summary.sql
-- Add summary fields to conversation_outputs table

-- Add summary-related columns to conversation_outputs
ALTER TABLE conversation_outputs 
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS tags text[],
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS summary_metadata jsonb;

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS conversation_outputs_category_idx
  ON conversation_outputs (category);

-- Create index for tag searches (GIN index for array operations)
CREATE INDEX IF NOT EXISTS conversation_outputs_tags_gin_idx
  ON conversation_outputs USING GIN (tags);

-- Add check constraint for standardized categories
ALTER TABLE conversation_outputs
ADD CONSTRAINT conversation_outputs_category_check
CHECK (category IS NULL OR category IN (
  'project',
  'pricing',
  'technical_support',
  'administrative',
  'warranty',
  'marketing',
  'internal',
  'not_relevant'
));