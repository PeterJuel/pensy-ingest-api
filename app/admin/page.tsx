// app/admin/page.tsx
import Link from "next/link";
import { query } from "@lib/db";
import { enqueueEmailProcess } from "../../src/lib/jobQueue";

type Email = {
  id: string;
  subject: string | null;
  inserted_at: string;
};

/**
 * Server Action: re-run strip_html for all emails
 */
export async function reprocessAllEmails(formData: FormData) {
  "use server";

  try {
    // Get all email IDs
    const emails = await query<{ id: string }>(
      `SELECT id FROM emails ORDER BY inserted_at DESC`
    );

    // Enqueue each email for processing with lower priority
    let enqueuedCount = 0;
    for (const email of emails) {
      await enqueueEmailProcess(email.id, { priority: 3 });
      enqueuedCount++;
    }

    console.log(`Enqueued ${enqueuedCount} emails for strip_html reprocessing`);

    // You could redirect with a success message or use revalidatePath
    // For now, the page will just refresh
  } catch (error) {
    console.error("Failed to enqueue all emails:", error);
    // In a production app, you might want to handle this error more gracefully
  }
}

export default async function AdminPage() {
  const emails = await query<Email>(
    `SELECT id, subject, inserted_at
       FROM emails
      ORDER BY inserted_at DESC
      LIMIT 100`
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-extrabold">Ingested Emails</h1>

        {/* Bulk Actions */}
        <div className="flex gap-3">
          <form action={reprocessAllEmails}>
            <button
              type="submit"
              className="btn btn-secondary"
              title="Re-run strip_html processing for all emails in the database"
            >
              Re-run strip_html (All Emails)
            </button>
          </form>
        </div>
      </div>

      {emails.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          No emails ingested yet.
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-gray-600">
            Showing latest {emails.length} emails
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {emails.map((email) => (
              <Link key={email.id} href={`/admin/${email.id}`}>
                <div className="card bg-base-100 shadow hover:shadow-lg transition p-4 cursor-pointer">
                  <h2 className="text-xl font-semibold link link-primary mb-2">
                    {email.subject ?? "(no subject)"}
                  </h2>
                  <p className="text-sm text-gray-500 break-words">
                    ID: {email.id}
                  </p>
                  <p className="text-sm text-gray-500">
                    Inserted:{" "}
                    {new Date(email.inserted_at).toLocaleString("da-DK")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
