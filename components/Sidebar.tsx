// components/Sidebar.tsx
"use client";
import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-xl font-semibold mb-6">Admin</h2>
      <nav className="flex flex-col space-y-2">
        <Link
          href="/admin"
          className="px-3 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Emails
        </Link>
        {/* add more nav links here */}
      </nav>
    </aside>
  );
}
