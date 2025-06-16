// app/admin/page.tsx
import Link from "next/link";
import { query } from "@lib/db";

type Email = {
  id: string;
  subject: string | null;
  inserted_at: string;
};

export default async function AdminPage() {
  const emails = await query<Email>(
    `SELECT id, subject, inserted_at
       FROM emails
      ORDER BY inserted_at DESC
      LIMIT 100`
  );

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-4xl font-extrabold mb-8">Ingested Emails</h1>

      {emails.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          No emails ingested yet.
        </div>
      ) : (
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
      )}
    </div>
  );
}
