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

    // Enqueue each email for strip_html processing only
    let enqueuedCount = 0;
    for (const email of emails) {
      await enqueueEmailProcess(email.id, {
        priority: 3,
        requestedSteps: ["strip_html"], // Only run strip_html
      });
      enqueuedCount++;
    }

    console.log(`Enqueued ${enqueuedCount} emails for strip_html reprocessing`);
  } catch (error) {
    console.error("Failed to enqueue all emails:", error);
  }
}

/**
 * Server Action: run all pipeline steps for all emails
 */
export async function runAllSteps(formData: FormData) {
  "use server";

  try {
    // Get all email IDs
    const emails = await query<{ id: string }>(
      `SELECT id FROM emails ORDER BY inserted_at DESC`
    );

    // Enqueue each email for all pipeline steps
    let enqueuedCount = 0;
    for (const email of emails) {
      await enqueueEmailProcess(email.id, {
        priority: 3,
        // No requestedSteps = run all registered steps
      });
      enqueuedCount++;
    }

    console.log(
      `Enqueued ${enqueuedCount} emails for full pipeline processing`
    );
  } catch (error) {
    console.error("Failed to enqueue all emails for full processing:", error);
  }
}

/**
 * Server Action: run conversation step for all unique conversations
 */
export async function reprocessAllConversations(formData: FormData) {
  "use server";

  try {
    // Get all unique conversation IDs that have emails
    const conversations = await query<{
      conversation_id: string;
      email_count: number;
    }>(
      `SELECT 
         conversation_id, 
         COUNT(*) as email_count
       FROM emails 
       WHERE conversation_id IS NOT NULL
       GROUP BY conversation_id
       ORDER BY MAX(received_at) DESC`
    );

    console.log(
      `Found ${conversations.length} unique conversations to process`
    );

    // For each conversation, pick one email to trigger the conversation step
    let processedCount = 0;
    for (const conversation of conversations) {
      try {
        // Get the most recent email from this conversation to use as trigger
        const [triggerEmail] = await query<{ id: string }>(
          `SELECT id FROM emails 
           WHERE conversation_id = $1 
           ORDER BY received_at DESC 
           LIMIT 1`,
          [conversation.conversation_id]
        );

        if (triggerEmail) {
          // Enqueue just the conversation step for this email
          await enqueueEmailProcess(triggerEmail.id, {
            priority: 3,
            requestedSteps: ["conversation"],
          });
          processedCount++;
        }
      } catch (error) {
        console.error(
          `Failed to enqueue conversation ${conversation.conversation_id}:`,
          error
        );
      }
    }

    console.log(
      `Enqueued conversation processing for ${processedCount}/${conversations.length} conversations`
    );
  } catch (error) {
    console.error("Failed to reprocess all conversations:", error);
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
              title="Re-run strip_html processing for all emails"
            >
              Strip_html
            </button>
          </form>

          <form action={reprocessAllConversations}>
            <button
              type="submit"
              className="btn btn-accent"
              title="Process conversation aggregation for all unique conversations"
            >
              Conversation
            </button>
          </form>

          <form action={runAllSteps}>
            <button
              type="submit"
              className="btn btn-primary"
              title="Run all pipeline steps for all emails"
            >
              Run All
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
