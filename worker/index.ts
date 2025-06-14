import { startWorker } from "@lib/jobQueue";

startWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
