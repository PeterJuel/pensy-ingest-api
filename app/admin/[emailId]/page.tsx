// app/admin/[emailId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@lib/db";
import JsonModal from "@/components/JsonModal";
import { enqueueEmailProcess } from "../../../src/lib/jobQueue";
import {
  runSpecificSteps,
  getPipelineStats,
} from "../../../src/pipeline/runner";
import { orchestrator } from "../../../src/pipeline/registry";

/**
 * Server Action: re-run specific pipeline steps for this email
 */
export async function reprocessSteps(formData: FormData) {
  "use server";
  const emailId = formData.get("emailId") as string;
  const selectedSteps = formData.getAll("steps") as string[];

  if (!emailId) return;

  // Only run if there are actually selected steps
  if (selectedSteps.length === 0) {
    console.log(`No steps selected for reprocessing email ${emailId}`);
    return; // Don't run anything if no steps are selected
  }

  try {
    // Create a job with specific steps metadata
    await enqueueEmailProcess(emailId, {
      priority: 5,
      // Store which specific steps to run in job metadata
      requestedSteps: selectedSteps,
    });

    console.log(
      `Enqueued specific steps [${selectedSteps.join(
        ", "
      )}] for email ${emailId}`
    );
  } catch (error) {
    console.error(`Failed to enqueue steps for ${emailId}:`, error);

    // Log the reprocessing attempt failure
    await query(
      `INSERT INTO pipeline_logs (email_id, step, status, details)
       VALUES ($1, $2, $3, $4)`,
      [
        emailId,
        "reprocess",
        "error",
        {
          error: error instanceof Error ? error.message : String(error),
          attempted_steps: selectedSteps,
          timestamp: new Date().toISOString(),
        },
      ]
    );
  }
}

/**
 * Server Action: re-run ALL pipeline steps for this email via job queue
 */
export async function reprocessAllSteps(formData: FormData) {
  "use server";
  const emailId = formData.get("emailId") as string;

  if (!emailId) return;

  try {
    // Re-run all steps via job queue with higher priority
    await enqueueEmailProcess(emailId, { priority: 5 });
    console.log(`Enqueued all steps for reprocessing email ${emailId}`);
  } catch (error) {
    console.error(`Failed to enqueue all steps for ${emailId}:`, error);
  }
}

/**
 * Server Action: clean up old pipeline logs for this email, keeping only the latest per step
 */
export async function cleanUpLogs(formData: FormData) {
  "use server";
  const emailId = formData.get("emailId") as string;
  if (!emailId) return;

  await query(
    `DELETE FROM pipeline_logs
     WHERE email_id = $1
       AND id NOT IN (
         SELECT id FROM (
           SELECT DISTINCT ON (step) id
           FROM pipeline_logs
           WHERE email_id = $1
           ORDER BY step, ts DESC
         ) latest
       )`,
    [emailId]
  );
}

interface Email {
  id: string;
  subject: string | null;
  meta: any;
  body: any;
  received_at: string;
}

interface PipelineLog {
  id: string;
  step: string;
  status: string;
  details: any;
  ts: string;
}

interface EmailOutput {
  id: string;
  output_type: string;
  content: any;
  metadata: any;
  created_at: string;
}

interface ThreadMsg {
  id: string;
  subject: string | null;
  received_at: string;
}

interface Props {
  params: { emailId: string };
}

export default async function EmailDetail({ params }: Props) {
  const { emailId } = await params;

  // Main email
  const [email] = await query<Email>(
    `SELECT id, subject, meta, body, received_at
     FROM emails WHERE id = $1`,
    [emailId]
  );
  if (!email) return notFound();

  // Pipeline logs
  const logs = await query<PipelineLog>(
    `SELECT id, step, status, details, ts
     FROM pipeline_logs WHERE email_id = $1 ORDER BY ts`,
    [emailId]
  );

  // Email outputs
  const outputs = await query<EmailOutput>(
    `SELECT id, output_type, content, metadata, created_at
     FROM email_outputs WHERE email_id = $1 ORDER BY created_at`,
    [emailId]
  );

  // Processing status
  const [status] = await query<{
    status: string;
    current_step: string | null;
    completed_steps: string[] | null;
    failed_steps: string[] | null;
  }>(
    `SELECT status, current_step, completed_steps, failed_steps
     FROM email_processing_status WHERE email_id = $1`,
    [emailId]
  );

  // Get available pipeline steps
  const availableSteps = orchestrator.getSteps();

  // Get pipeline statistics for this email
  const pipelineStats = await getPipelineStats(emailId);

  // Conversation thread
  const thread = await query<ThreadMsg>(
    `SELECT id, subject, received_at
     FROM emails WHERE conversation_id = (
       SELECT conversation_id FROM emails WHERE id = $1
     ) ORDER BY received_at`,
    [emailId]
  );

  return (
    <div className="p-8">
      <Link href="/admin" className="text-blue-600 hover:underline mb-4 block">
        ← Back to email list
      </Link>

      <h1 className="text-2xl font-bold mb-2">Email Details</h1>
      <p className="mb-4">
        <strong>ID:</strong> {email.id}
      </p>
      <p className="mb-6">
        <strong>Subject:</strong> {email.subject ?? "(no subject)"}
      </p>

      {/* Processing Status */}
      {status && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
          <h3 className="font-semibold mb-2">Processing Status</h3>
          <p>
            <strong>Status:</strong>{" "}
            <span
              className={`px-2 py-1 rounded text-sm ${
                status.status === "completed"
                  ? "bg-green-100 text-green-800"
                  : status.status === "processing"
                  ? "bg-yellow-100 text-yellow-800"
                  : status.status === "failed"
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {status.status}
            </span>
          </p>
          {status.current_step && (
            <p>
              <strong>Current Step:</strong> {status.current_step}
            </p>
          )}
        </div>
      )}

      {/* Attachment indicator */}
      <p className="mb-6">
        <strong>Attachments:</strong>{" "}
        {email.meta?.hasAttachments ? "Yes" : "No"}
      </p>

      {/* Action buttons section */}
      <section className="mb-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          {/* View Body Button */}
          <JsonModal body={email.body} modalId={`body-modal-${email.id}`} />

          {/* Clean up logs button */}
          <form action={cleanUpLogs} className="inline">
            <input type="hidden" name="emailId" value={email.id} />
            <button type="submit" className="btn btn-sm btn-warning">
              Clean up logs
            </button>
          </form>
        </div>

        {/* Pipeline Step Selection */}
        <form action={reprocessSteps} className="space-y-4">
          <input type="hidden" name="emailId" value={email.id} />

          <div>
            <h3 className="font-medium mb-2">Reprocess Pipeline Steps:</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableSteps
                .sort((a, b) => a.priority - b.priority)
                .map((step) => {
                  const isCompleted = logs.some(
                    (log) => log.step === step.name && log.status === "ok"
                  );
                  const hasFailed = logs.some(
                    (log) => log.step === step.name && log.status === "error"
                  );

                  return (
                    <label
                      key={step.name}
                      className="flex items-center space-x-2 p-2 rounded border hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <input
                        type="checkbox"
                        name="steps"
                        value={step.name}
                        className="checkbox checkbox-sm"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{step.name}</span>
                        <div className="flex items-center space-x-2">
                          {isCompleted && (
                            <span className="text-xs px-1 py-0.5 bg-green-100 text-green-700 rounded">
                              ✓
                            </span>
                          )}
                          {hasFailed && (
                            <span className="text-xs px-1 py-0.5 bg-red-100 text-red-700 rounded">
                              ✗
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            P{step.priority}
                          </span>
                        </div>
                        {step.description && (
                          <p className="text-xs text-gray-500 mt-1">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-sm btn-secondary">
              Reprocess Selected Steps
            </button>
          </div>
        </form>

        {/* Separate form for reprocessing all steps */}
        <form action={reprocessAllSteps} className="mt-2">
          <input type="hidden" name="emailId" value={email.id} />
          <button type="submit" className="btn btn-sm btn-primary">
            Reprocess All Steps
          </button>
        </form>
      </section>

      {/* Pipeline Statistics */}
      {pipelineStats.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-2">Pipeline Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pipelineStats.map((stat: any, index: number) => (
              <div
                key={index}
                className="p-3 bg-white dark:bg-gray-800 rounded border"
              >
                <h3 className="font-medium">{stat.step}</h3>
                <p className="text-sm text-gray-600">
                  Status:{" "}
                  <span
                    className={`font-medium ${
                      stat.status === "ok"
                        ? "text-green-600"
                        : stat.status === "error"
                        ? "text-red-600"
                        : "text-yellow-600"
                    }`}
                  >
                    {stat.status}
                  </span>
                </p>
                <p className="text-sm text-gray-600">
                  Executions: {stat.count}
                </p>
                {stat.avg_duration_ms && (
                  <p className="text-sm text-gray-600">
                    Avg Duration: {Math.round(stat.avg_duration_ms)}ms
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pipeline Logs */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Pipeline Logs</h2>
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b px-3 py-2 text-left">Time</th>
              <th className="border-b px-3 py-2 text-left">Step</th>
              <th className="border-b px-3 py-2 text-left">Status</th>
              <th className="border-b px-3 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className={
                  log.status === "error"
                    ? "bg-red-50 dark:bg-red-900/20"
                    : log.status === "ok"
                    ? "bg-green-50 dark:bg-green-900/20"
                    : ""
                }
              >
                <td className="border-b px-3 py-2 text-sm text-gray-600">
                  {new Date(log.ts).toLocaleString("da-DK")}
                </td>
                <td className="border-b px-3 py-2 font-medium">{log.step}</td>
                <td className="border-b px-3 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      log.status === "ok"
                        ? "bg-green-100 text-green-800"
                        : log.status === "error"
                        ? "bg-red-100 text-red-800"
                        : log.status === "duplicate"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="border-b px-3 py-2">
                  <pre className="whitespace-pre-wrap text-xs max-w-md overflow-hidden">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Email Outputs */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Email Outputs</h2>
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b px-3 py-2 text-left">Time</th>
              <th className="border-b px-3 py-2 text-left">Type</th>
              <th className="border-b px-3 py-2 text-left">Content</th>
              <th className="border-b px-3 py-2 text-left">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {outputs.map((out) => (
              <tr key={out.id}>
                <td className="border-b px-3 py-2 text-sm text-gray-600">
                  {new Date(out.created_at).toLocaleString("da-DK")}
                </td>
                <td className="border-b px-3 py-2 font-medium">
                  {out.output_type}
                </td>
                <td className="border-b px-3 py-2">
                  <pre className="whitespace-pre-wrap text-xs max-w-md overflow-hidden">
                    {JSON.stringify(out.content, null, 2)}
                  </pre>
                </td>
                <td className="border-b px-3 py-2">
                  <pre className="whitespace-pre-wrap text-xs max-w-md overflow-hidden">
                    {JSON.stringify(out.metadata, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Conversation Thread */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold mb-2">Conversation Thread</h2>
        <ul className="space-y-2">
          {thread.map((msg) => (
            <li key={msg.id}>
              <Link
                href={`/admin/${msg.id}`}
                className={`block p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  msg.id === email.id
                    ? "bg-blue-100 dark:bg-blue-900 font-semibold"
                    : ""
                }`}
              >
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">
                    {new Date(msg.received_at).toLocaleString("da-DK")}
                  </span>
                  <span>{msg.subject ?? "(no subject)"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
