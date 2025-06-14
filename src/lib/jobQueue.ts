import { makeWorkerUtils, run } from "graphile-worker";
import { pool } from "@lib/db";

// cache én utils-instans pr. process
let utilsPromise: ReturnType<typeof makeWorkerUtils> | null = null;
function getWorkerUtils() {
  if (!utilsPromise) {
    utilsPromise = makeWorkerUtils({ pgPool: pool });
  }
  return utilsPromise;
}

export async function enqueueEmailProcess(emailId: string) {
  const utils = await getWorkerUtils();
  await utils.addJob("dummy_step", { emailId });
}

interface MailJobPayload {
  emailId: string;
}

export async function startWorker() {
  await run({
    pgPool: pool,
    concurrency: 5,
    taskList: {
      dummy_step: async (payload) => {
        const { emailId } = payload as MailJobPayload; // type-cast
        console.log("Dummy step running for", emailId);
      },
    },
  });
}