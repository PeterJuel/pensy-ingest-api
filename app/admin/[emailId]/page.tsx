// app/admin/[emailId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@lib/db";
import JsonModal from "@/components/JsonModal";
import { stripHtml } from "../../../src/pipeline/steps/stripHtml";

/**
 * Server Action: re-run strip_html for this email
 */
export async function reprocessStripHtml(formData: FormData) {
  "use server";
  const emailId = formData.get("emailId") as string;
  if (!emailId) return;
  const [email] = await query<{
    id: string;
    subject: string;
    body: any;
    conversation_id: string | null;
    received_at: string;
  }>(
    `SELECT id, subject, body, conversation_id, received_at
       FROM emails WHERE id = $1`,
    [emailId]
  );
  if (!email) throw new Error("Email not found");
  await stripHtml(email);
}

/**
 * Server Action: clean up old pipeline logs for this email, keeping only the latest per step
 */
export async function cleanUpLogs(formData: FormData) {
  "use server";
  const emailId = formData.get("emailId") as string;
  if (!emailId) return;
  // Delete all but the most recent log per step
  await query(
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
    `,
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
      {/* Attachment indicator */}
      <p className="mb-6">
        <strong>Attachments:</strong>{" "}
        {email.meta?.hasAttachments ? "Yes" : "No"}
      </p>

      {/* Clean up logs button */}
      <form action={cleanUpLogs} className="mb-6">
        <input type="hidden" name="emailId" value={email.id} />
        <button type="submit" className="btn btn-sm btn-warning">
          Clean up logs
        </button>
      </form>

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
              <th className="border-b px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="border-b px-3 py-2 text-sm text-gray-600">
                  {new Date(log.ts).toLocaleString("da-DK")}
                </td>
                <td className="border-b px-3 py-2">{log.step}</td>
                <td className="border-b px-3 py-2">{log.status}</td>
                <td className="border-b px-3 py-2">
                  {log.step === "inpoint" ? (
                    <JsonModal
                      body={email.body}
                      modalId={`body-modal-${log.id}`}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-xs">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </td>
                <td className="border-b px-3 py-2">
                  {log.step === "strip_html" && (
                    <form action={reprocessStripHtml} className="inline">
                      <input type="hidden" name="emailId" value={email.id} />
                      <button
                        type="submit"
                        className="btn btn-sm btn-secondary"
                      >
                        Re-run strip_html
                      </button>
                    </form>
                  )}
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
                <td className="border-b px-3 py-2">{out.output_type}</td>
                <td className="border-b px-3 py-2">
                  <pre className="whitespace-pre-wrap text-xs">
                    {JSON.stringify(out.content, null, 2)}
                  </pre>
                </td>
                <td className="border-b px-3 py-2">
                  <pre className="whitespace-pre-wrap text-xs">
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
