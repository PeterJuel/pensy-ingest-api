import { startWorker, stopWorker } from "../lib/jobQueue";
import logger from "../lib/logger";

// Test the new logger
logger.info('Worker process started', 'WORKER');

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully", "WORKER");
  await stopWorker();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully", "WORKER");
  await stopWorker();
  process.exit(0);
});

startWorker().catch((err) => {
  logger.error("Worker failed to start", "WORKER", { error: err.message });
  process.exit(1);
});
