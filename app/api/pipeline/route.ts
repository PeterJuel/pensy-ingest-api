// app/api/pipeline/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query as dbQuery } from "@lib/db";
import { orchestrator } from "../../../src/pipeline/registry";
import {
  runSpecificSteps,
  getPipelineStats,
} from "../../../src/pipeline/runner";
import logger from "../../../src/lib/logger";

// GET /api/pipeline - Get pipeline information and statistics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "stats";
    const emailId = searchParams.get("emailId");

    switch (action) {
      case "stats":
        if (emailId) {
          const stats = await getPipelineStats(emailId);
          return NextResponse.json({ emailId, stats });
        } else {
          // Global pipeline statistics
          const globalStats = await dbQuery(`
            SELECT 
              step,
              status,
              COUNT(*) as count,
              AVG(
                CASE 
                  WHEN details ? 'duration' AND details->>'duration' ~ '^[0-9]+(\.[0-9]+)?$' 
                  THEN (details->>'duration')::numeric 
                  ELSE NULL 
                END
              ) as avg_duration_ms,
              MIN(ts) as first_seen,
              MAX(ts) as last_seen
            FROM pipeline_logs 
            WHERE ts > now() - interval '24 hours'
            GROUP BY step, status
            ORDER BY step, status
          `);

          const processingStats = await dbQuery(`
            SELECT status, COUNT(*) as count
            FROM email_processing_status
            GROUP BY status
            ORDER BY status
          `);

          return NextResponse.json({
            globalStats,
            processingStats,
            timeRange: "24 hours",
          });
        }

      case "steps":
        // Get available pipeline steps
        const steps = orchestrator.getSteps().map((step) => ({
          name: step.name,
          dependencies: step.dependencies,
          retryable: step.retryable,
          priority: step.priority,
          timeout: step.timeout,
          description: step.description,
        }));
        return NextResponse.json({ steps });

      case "status":
        if (!emailId) {
          return NextResponse.json(
            { error: "emailId required for status check" },
            { status: 400 }
          );
        }

        const [status] = await dbQuery(
          `
          SELECT 
            email_id,
            status,
            current_step,
            completed_steps,
            failed_steps,
            started_at,
            completed_at,
            updated_at
          FROM email_processing_status 
          WHERE email_id = $1
        `,
          [emailId]
        );

        if (!status) {
          return NextResponse.json(
            { error: "Email not found or not processed" },
            { status: 404 }
          );
        }

        return NextResponse.json({ status });

      case "stuck":
        // Get emails that seem to be stuck in processing
        const stuckEmails = await dbQuery(`
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
          ORDER BY eps.updated_at
          LIMIT 50
        `);

        return NextResponse.json({ stuckEmails });

      case "summary":
        // Pipeline summary view
        const stepSummary = await dbQuery(`
          SELECT * FROM pipeline_step_summary
        `);

        const processingSummary = await dbQuery(`
          SELECT * FROM email_processing_summary
        `);

        return NextResponse.json({
          stepSummary,
          processingSummary,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    logger.error(
      "Pipeline API error occurred",
      "API",
      { error: error instanceof Error ? error.message : String(error) }
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// POST /api/pipeline - Execute pipeline operations
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, emailId, steps, ...params } = body;

    switch (action) {
      case "execute":
        if (!emailId) {
          return NextResponse.json(
            { error: "emailId required" },
            { status: 400 }
          );
        }

        if (steps && Array.isArray(steps)) {
          // Execute specific steps
          const context = await runSpecificSteps(emailId, steps);
          return NextResponse.json({
            success: true,
            message: `Pipeline executed for email ${emailId}`,
            executedSteps: steps,
            completedSteps: Array.from(context.completedSteps),
            failedSteps: Array.from(context.failedSteps),
            totalDuration: Date.now() - context.startTime,
          });
        } else {
          return NextResponse.json(
            { error: "steps array required" },
            { status: 400 }
          );
        }

      case "reset_status":
        if (!emailId) {
          return NextResponse.json(
            { error: "emailId required" },
            { status: 400 }
          );
        }

        // Reset the processing status for an email
        await dbQuery(
          `
          UPDATE email_processing_status 
          SET 
            status = 'pending',
            current_step = NULL,
            completed_steps = '{}',
            failed_steps = '{}',
            updated_at = now()
          WHERE email_id = $1
        `,
          [emailId]
        );

        return NextResponse.json({
          success: true,
          message: `Processing status reset for email ${emailId}`,
        });

      case "cleanup_stuck":
        // Reset stuck emails back to pending
        const stuckResult = await dbQuery(`
          UPDATE email_processing_status 
          SET 
            status = 'pending',
            current_step = NULL,
            updated_at = now()
          WHERE status = 'processing' 
            AND updated_at < now() - interval '1 hour'
          RETURNING email_id
        `);

        return NextResponse.json({
          success: true,
          message: `Reset ${stuckResult.length} stuck emails`,
        });

      case "retry_failed":
        const emailIds = params.emailIds as string[];
        if (!emailIds || !Array.isArray(emailIds)) {
          return NextResponse.json(
            { error: "emailIds array required" },
            { status: 400 }
          );
        }

        let retriedCount = 0;
        for (const id of emailIds) {
          try {
            // Reset status and retry
            await dbQuery(
              `
              UPDATE email_processing_status 
              SET status = 'pending', updated_at = now()
              WHERE email_id = $1
            `,
              [id]
            );

            // Re-enqueue for processing
            const { enqueueEmailProcess } = await import(
              "../../../src/lib/jobQueue"
            );
            await enqueueEmailProcess(id, { priority: 3 });
            retriedCount++;
          } catch (error) {
            logger.error(
              "Failed to retry email processing",
              "API",
              { 
                emailId: id, 
                error: error instanceof Error ? error.message : String(error) 
              }
            );
          }
        }

        return NextResponse.json({
          success: true,
          message: `Retried ${retriedCount} failed emails`,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    logger.error(
      "Pipeline operation error occurred",
      "API",
      { error: error instanceof Error ? error.message : String(error) }
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// DELETE /api/pipeline - Clean up pipeline data
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const emailId = searchParams.get("emailId");

    switch (action) {
      case "logs":
        if (emailId) {
          // Clean up logs for specific email (keep only latest per step)
          const deleteResult = await dbQuery(
            `
            DELETE FROM pipeline_logs
            WHERE email_id = $1
              AND id NOT IN (
                SELECT id FROM (
                  SELECT DISTINCT ON (step) id
                  FROM pipeline_logs
                  WHERE email_id = $1
                  ORDER BY step, ts DESC
                ) latest
              )
            RETURNING id
          `,
            [emailId]
          );

          return NextResponse.json({
            success: true,
            message: `Cleaned up ${deleteResult.length} old log entries for email ${emailId}`,
          });
        } else {
          // Clean up old logs globally
          const days = parseInt(searchParams.get("days") || "30");
          const deleteResult = await dbQuery(`
            DELETE FROM pipeline_logs
            WHERE ts < now() - interval '${days} days'
            RETURNING id
          `);

          return NextResponse.json({
            success: true,
            message: `Deleted ${deleteResult.length} old log entries`,
          });
        }

      case "outputs":
        if (!emailId) {
          return NextResponse.json(
            { error: "emailId required" },
            { status: 400 }
          );
        }

        // Delete all outputs for an email (forcing reprocessing)
        const deleteResult = await dbQuery(
          `
          DELETE FROM email_outputs WHERE email_id = $1
          RETURNING id
        `,
          [emailId]
        );

        return NextResponse.json({
          success: true,
          message: `Deleted ${deleteResult.length} outputs for email ${emailId}`,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    logger.error(
      "Pipeline cleanup error occurred",
      "API",
      { error: error instanceof Error ? error.message : String(error) }
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
