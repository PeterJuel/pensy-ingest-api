// src/lib/jobQueue.ts
import PgBoss from "pg-boss";
import { query as dbQuery } from "./db";
import logger from "./logger";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Singleton instance
let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    if (!connectionString) {
      throw new Error("DATABASE_URL is not defined");
    }

    boss = new PgBoss(connectionString);
    boss.on("error", (error) => logger.error("pg-boss error", "QUEUE", { error: error.message }));

    await boss.start();
    logger.info("pg-boss started", "QUEUE");

    // Create required queue with retry configuration
    await boss.createQueue(JOB_TYPES.PROCESS_EMAIL, {
      retryLimit: 2,        // 2 retries (3 total attempts)
      retryDelay: 30000,    // 30 seconds delay between retries
      retryBackoff: true    // exponential backoff (30s, 60s, 120s, etc.)
    });
  }
  return boss;
}

// Job types
export const JOB_TYPES = {
  PROCESS_EMAIL: "process_email",
} as const;

export interface EmailJobPayload {
  emailId: string;
  priority?: number;
  requestedSteps?: string[]; // Add this to specify which steps to run
}

/**
 * Enqueue email for processing (individual)
 */
export async function enqueueEmailProcess(
  emailId: string,
  options: {
    priority?: number;
    delay?: number; // seconds
    startAfter?: Date;
    requestedSteps?: string[]; // Add this parameter
  } = {}
) {
  const boss = await getBoss();

  const jobOptions: any = {};
  if (options.priority) jobOptions.priority = options.priority;
  if (options.delay)
    jobOptions.startAfter = new Date(Date.now() + options.delay * 1000);
  if (options.startAfter) jobOptions.startAfter = options.startAfter;

  const jobData: EmailJobPayload = {
    emailId,
    requestedSteps: options.requestedSteps, // Include requested steps in job data
  };

  logger.debug("About to send job", "ENQUEUE", {
    type: JOB_TYPES.PROCESS_EMAIL,
    data: jobData,
    options: jobOptions,
  });

  const jobId = await boss.send(JOB_TYPES.PROCESS_EMAIL, jobData, jobOptions);
  logger.info(
    `Enqueued email processing job ${jobId} for email: ${emailId}${
      options.requestedSteps
        ? ` (steps: ${options.requestedSteps.join(", ")})`
        : ""
    }`,
    "ENQUEUE",
    { jobId, emailId, requestedSteps: options.requestedSteps }
  );

  return jobId;
}

/**
 * Start the worker to process jobs
 */
export async function startWorker() {
  const boss = await getBoss();

  // Register job handler with batch processing
  await boss.work(
    JOB_TYPES.PROCESS_EMAIL,
    {
      batchSize: 5, // Process up to 20 jobs at once
    },
    async (jobs) => {
      // jobs will be an array of 1-20 jobs
      const jobArray = Array.isArray(jobs) ? jobs : [jobs];

      logger.info(
        `Processing batch of ${jobArray.length} jobs`,
        "WORKER",
        { batchSize: jobArray.length, pid: process.pid }
      );

      // Process all jobs in parallel using Promise.all
      await Promise.all(
        jobArray.map(async (singleJob: any) => {
          // Type guard to ensure proper structure
          if (
            !singleJob?.data ||
            typeof singleJob.data !== "object" ||
            !singleJob.data.emailId
          ) {
            logger.error(
              "Invalid job data",
              "WORKER",
              { pid: process.pid, jobData: singleJob }
            );
            throw new Error(`Invalid job data: ${JSON.stringify(singleJob)}`);
          }

          const jobData = singleJob.data as EmailJobPayload;
          const { emailId } = jobData;

          logger.info(
            `Processing email job ${singleJob.id}: ${emailId}${
              jobData.requestedSteps
                ? ` (steps: ${jobData.requestedSteps.join(", ")})`
                : ""
            }`,
            "WORKER",
            { 
              pid: process.pid, 
              jobId: singleJob.id, 
              emailId, 
              requestedSteps: jobData.requestedSteps 
            }
          );

          try {
            const { runPipelineSteps } = await import("../pipeline/runner");

            // Pass the requested steps to the runner
            await runPipelineSteps(emailId, jobData.requestedSteps);

            logger.info(
              `Email processing completed: ${emailId}${
                jobData.requestedSteps
                  ? ` (steps: ${jobData.requestedSteps.join(", ")})`
                  : ""
              }`,
              "WORKER",
              { pid: process.pid, emailId, requestedSteps: jobData.requestedSteps }
            );
          } catch (error) {
            logger.error(
              `Email processing failed: ${emailId}`,
              "WORKER",
              { 
                pid: process.pid, 
                emailId, 
                error: error instanceof Error ? error.message : String(error)
              }
            );
            throw error; // pg-boss handles retries
          }
        })
      );

      logger.info(
        `Batch of ${jobArray.length} jobs completed`,
        "WORKER",
        { batchSize: jobArray.length, pid: process.pid }
      );
    }
  );

  logger.info(
    "Workers started and listening for jobs with batch processing enabled",
    "WORKER"
  );
}

/**
 * Get queue statistics (useful for monitoring)
 */
export async function getQueueStats() {
  const boss = await getBoss();

  // Get job counts by state
  const stats = {
    active: await boss.getQueueSize("active"),
    completed: await boss.getQueueSize("completed"),
    failed: await boss.getQueueSize("failed"),
    pending: await boss.getQueueSize("created"),
  };

  return stats;
}

/**
 * Cancel/postpone specific job
 */
export async function cancelJob(jobId: string) {
  const boss = await getBoss();

  // Need to get the job name first
  const [jobInfo] = await dbQuery(
    `
    SELECT name FROM pgboss.job WHERE id = $1
  `,
    [jobId]
  );

  if (!jobInfo) {
    throw new Error(`Job ${jobId} not found`);
  }

  await boss.cancel(jobInfo.name, jobId);
}

/**
 * Graceful shutdown
 */
export async function stopWorker() {
  if (boss) {
    await boss.stop();
    logger.info("pg-boss stopped", "QUEUE");
  }
}
