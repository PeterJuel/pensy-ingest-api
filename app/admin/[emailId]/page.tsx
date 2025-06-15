// app/admin/[emailId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@lib/db";

type Email = {
  id: string;
  subject: string | null;
  meta: any;
  body: any;
};

type PipelineLog = {
  id: string;
  step: string;
  status: string;
  details: any;
  ts: string;
};

type EmailOutput = {
  id: string;
  output_type: string;
  content: any;
  metadata: any;
  created_at: string;
};

interface Props {
  params: { emailId: string };
}

export default async function EmailDetail({ params }: Props) {
   const { emailId } = await params;

  // Load email row
  const [email] = await query<Email>(
    `SELECT id, subject, meta, body FROM emails WHERE id = $1`,
    [emailId]
  );
  if (!email) return notFound();

  // Load pipeline logs
  const logs = await query<PipelineLog>(
    `SELECT id, step, status, details, ts
       FROM pipeline_logs
      WHERE email_id = $1
      ORDER BY ts`,
    [emailId]
  );

  // Load outputs
  const outputs = await query<EmailOutput>(
    `SELECT id, output_type, content, metadata, created_at
       FROM email_outputs
      WHERE email_id = $1
      ORDER BY created_at`,
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
              <tr key={log.id}>
                <td className="border-b px-3 py-2 text-sm text-gray-600">
                  {new Date(log.ts).toLocaleString("da-DK")}
                </td>
                <td className="border-b px-3 py-2">{log.step}</td>
                <td className="border-b px-3 py-2">{log.status}</td>
                <td className="border-b px-3 py-2">
                  <pre className="whitespace-pre-wrap text-xs">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
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
    </div>
  );
}
