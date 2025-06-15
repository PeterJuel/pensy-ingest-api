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
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Ingested Emails</h1>
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b px-4 py-2 text-left">Subject</th>
            <th className="border-b px-4 py-2 text-left">ID</th>
            <th className="border-b px-4 py-2 text-left">Inserted At</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email) => (
            <tr key={email.id}>
              <td className="border-b px-4 py-2">
                <Link
                  href={`/admin/${email.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {email.subject ?? "(no subject)"}
                </Link>
              </td>
              <td className="border-b px-4 py-2 text-sm text-gray-600">
                {email.id}
              </td>
              <td className="border-b px-4 py-2 text-sm text-gray-600">
                {new Date(email.inserted_at).toLocaleString("da-DK")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
