import { startWorker, stopWorker } from "../lib/jobQueue";

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  await stopWorker();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  await stopWorker();
  process.exit(0);
});

startWorker().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
