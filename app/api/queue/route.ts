// app/api/queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBoss, getQueueStats, JOB_TYPES } from "@lib/jobQueue";
import { query as dbQuery } from "@lib/db";
import logger from "../../../src/lib/logger";

// GET /api/queue - View queue status
export async function GET(req: NextRequest) {
  try {
    const boss = await getBoss();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "stats";

    switch (action) {
      case "stats":
        const stats = await getQueueStats();
        return NextResponse.json(stats);

      case "jobs":
        const limit = parseInt(searchParams.get("limit") || "50");
        const state = searchParams.get("state"); // active, completed, failed, created

        let query = `
          SELECT 
            id,
            name as job_type,
            data,
            state,
            priority,
            retry_count,
            created_on,
            started_on,
            completed_on,
            start_after,
            output
          FROM pgboss.job 
        `;

        const params: any[] = [];
        if (state) {
          query += ` WHERE state = $1`;
          params.push(state);
        }

        query += ` ORDER BY created_on DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const jobs = await dbQuery(query, params);

        return NextResponse.json({ jobs });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    logger.error(
      "Queue API error occurred",
      "API",
      { error: error instanceof Error ? error.message : String(error) }
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// POST /api/queue - Queue management actions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, jobId, ...params } = body;
    const boss = await getBoss();

    switch (action) {
      case "cancel":
        if (!jobId) {
          return NextResponse.json(
            { error: "jobId required" },
            { status: 400 }
          );
        }

        // Need to get the job name first
        const [jobInfo] = await dbQuery(
          `
          SELECT name FROM pgboss.job WHERE id = $1
        `,
          [jobId]
        );

        if (!jobInfo) {
          return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        await boss.cancel(jobInfo.name, jobId);
        return NextResponse.json({
          success: true,
          message: `Job ${jobId} cancelled`,
        });

      case "retry_failed":
        const jobType = params.jobType;
        if (jobType && jobType === JOB_TYPES.PROCESS_EMAIL) {
          // Get failed jobs and create new ones
          const failedJobs = await dbQuery(
            `
            SELECT id, data FROM pgboss.job 
            WHERE state = 'failed' AND name = $1
          `,
            [jobType]
          );

          let retriedCount = 0;
          for (const job of failedJobs) {
            try {
              // Create a new job with the same data
              await boss.send(jobType, job.data);
              // Mark the old job as cancelled (requires job name and id)
              await boss.cancel(jobType, job.id);
              retriedCount++;
            } catch (error) {
              logger.error(
                "Failed to retry job",
                "API",
                { 
                  jobId: job.id, 
                  error: error instanceof Error ? error.message : String(error) 
                }
              );
            }
          }

          return NextResponse.json({
            success: true,
            message: `Created ${retriedCount} retry jobs for failed ${jobType} jobs`,
          });
        }
        return NextResponse.json(
          { error: "Invalid or missing jobType" },
          { status: 400 }
        );

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    logger.error(
      "Queue management error occurred",
      "API",
      { error: error instanceof Error ? error.message : String(error) }
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
