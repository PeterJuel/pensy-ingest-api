# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js-based RAG (Retrieval-Augmented Generation) ingestion pipeline designed to process Office 365 emails. The system receives emails as JSON, removes PII, stores sanitized content in PostgreSQL, and processes them through a configurable pipeline system.

## Key Architecture Components

### Pipeline System
The core of the application is a sophisticated pipeline orchestrator (`src/pipeline/orchestrator.ts`) that executes processing steps with dependency resolution, parallel execution, and failure handling. Steps are registered in `src/pipeline/registry.ts` and defined in `src/pipeline/steps/`:

- **stripHtml**: Converts HTML email content to plain text
- **conversation**: Aggregates emails into conversation threads  
- **summary**: Generates LLM-powered summaries, titles, tags, and categories

Steps support dependencies, parallel execution, timeouts, and retry logic. The orchestrator uses topological sorting for dependency resolution and can execute all steps or specific subsets.

### Job Queue
Uses pg-boss (`src/lib/jobQueue.ts`) for background processing with PostgreSQL as the queue backend. The worker process (`src/worker/index.ts`) handles job execution.

### Data Flow
1. Emails arrive via `POST /api/inpoint` 
2. PII is scrubbed using regex patterns (`src/lib/pii.ts`)
3. Emails stored in `emails` table
4. Pipeline steps process emails, storing outputs in `email_outputs` table
5. Admin interface (`app/admin/`) provides pipeline management and monitoring

### Database Schema
- `emails`: Core email data (PII-scrubbed) with fields: id, source_id, received_at, subject, meta, body, conversation_id, inserted_at
- `email_outputs`: All processed outputs from pipeline steps with fields: id, email_id, output_type, content, metadata, pipeline_version, created_at
- `pipeline_logs`: Execution logs and timing with fields: id, email_id, batch_id, step, status, details, ts
- `email_processing_status`: Current processing state with fields: email_id, status, current_step, completed_steps, failed_steps, started_at, completed_at, updated_at
- `conversation_outputs`: Aggregated conversation data with fields: id, conversation_id, content, summary, title, tags, category, metadata, summary_metadata, pipeline_version, created_at, updated_at

## Development Commands

```bash
# Start development server
npm run dev

# Start background worker (required for pipeline processing)
npm run worker:dev

# Build for production
npm run build

# Run database migrations
npm run migrate

# Start production server
npm start
```

## Environment Setup

Create `.env.local` with:
- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: For LLM summary generation
- `LANGCHAIN_API_KEY`: For LangChain tracing (optional)

## Key Files

- `src/pipeline/orchestrator.ts`: Core pipeline execution engine
- `src/pipeline/registry.ts`: Step registration and HMR persistence
- `src/lib/pii.ts`: PII scrubbing functionality  
- `src/lib/jobQueue.ts`: Background job management
- `app/api/inpoint/route.ts`: Email ingestion endpoint
- `app/admin/`: Pipeline management interface

## Pipeline Development

When adding new pipeline steps:
1. Create step function in `src/pipeline/steps/`
2. Define step configuration in `src/pipeline/steps/index.ts`
3. Register step in `src/pipeline/registry.ts`
4. Add database migration if new output types needed

Steps should be idempotent and handle the `Email` interface defined in `src/pipeline/types.ts`. Use the `email_outputs` table to store processed results.

## Testing Pipeline Steps

Use the admin interface at `/admin` to:
- View email processing status
- Manually trigger specific pipeline steps
- Monitor execution logs and timing
- Debug step failures

The admin interface supports selective reprocessing of individual steps without running dependencies.