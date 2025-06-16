import PgBoss from "pg-boss";
import { query as dbQuery } from "./db";

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
    boss.on("error", console.error);

    await boss.start();
    console.log("pg-boss started");

    // Create required queues
    await boss.createQueue(JOB_TYPES.PROCESS_EMAIL);
    await boss.createQueue(JOB_TYPES.LLM_BATCH);
    await boss.createQueue(JOB_TYPES.GENERATE_EMBEDDINGS);
  }
  return boss;
}

// Job types
export const JOB_TYPES = {
  PROCESS_EMAIL: "process_email",
  LLM_BATCH: "llm_batch",
  GENERATE_EMBEDDINGS: "generate_embeddings",
} as const;

interface EmailJobPayload {
  emailId: string;
  priority?: number;
}

interface LLMBatchPayload {
  emailIds: string[];
  operation: "summarize" | "categorize" | "extract_entities";
  batchSize?: number;
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
  } = {}
) {
  const boss = await getBoss();

  const jobOptions: any = {};
  if (options.priority) jobOptions.priority = options.priority;
  if (options.delay)
    jobOptions.startAfter = new Date(Date.now() + options.delay * 1000);
  if (options.startAfter) jobOptions.startAfter = options.startAfter;

  await boss.send(JOB_TYPES.PROCESS_EMAIL, { emailId }, jobOptions);
  console.log(`Enqueued email processing: ${emailId}`);
}

/**
 * Enqueue batch LLM processing (for efficiency)
 */
export async function enqueueLLMBatch(
  payload: LLMBatchPayload,
  options: {
    priority?: number;
    startAfter?: Date;
  } = {}
) {
  const boss = await getBoss();

  const jobOptions: any = {};
  if (options.priority) jobOptions.priority = options.priority;
  if (options.startAfter) jobOptions.startAfter = options.startAfter;

  await boss.send(JOB_TYPES.LLM_BATCH, payload, jobOptions);
  console.log(
    `Enqueued LLM batch: ${payload.operation} for ${payload.emailIds.length} emails`
  );
}

/**
 * Start the worker to process jobs
 */
export async function startWorker() {
  const boss = await getBoss();

  // Register job handlers
  await boss.work(
    JOB_TYPES.PROCESS_EMAIL,
    async (job) => {
      // Handle both single job and array cases
      const jobs = Array.isArray(job) ? job : [job];

      for (const singleJob of jobs) {
        const { emailId } = singleJob.data as EmailJobPayload;
        console.log(`Processing email job ${singleJob.id}: ${emailId}`);

        try {
          const { runPipelineSteps } = await import("../pipeline/runner");
          await runPipelineSteps(emailId);
          console.log(`Email processing completed: ${emailId}`);
        } catch (error) {
          console.error(`Email processing failed: ${emailId}`, error);
          throw error; // pg-boss handles retries
        }
      }
    }
  );

  await boss.work(JOB_TYPES.LLM_BATCH, async (job) => {
    // Handle both single job and array cases
    const jobs = Array.isArray(job) ? job : [job];

    for (const singleJob of jobs) {
      const payload = singleJob.data as LLMBatchPayload;
      console.log(
        `Processing LLM batch job ${singleJob.id}: ${payload.operation}`
      );

      try {
        // TODO: Implement batch LLM processing
        console.log(
          `LLM batch processing: ${payload.operation} for ${payload.emailIds.length} emails`
        );
        // await processBatchLLM(payload);
      } catch (error) {
        console.error(`LLM batch processing failed`, error);
        throw error;
      }
    }
  });

  console.log("Workers started and listening for jobs");
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
    console.log("pg-boss stopped");
  }
}
