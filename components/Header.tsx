// components/Header.tsx
"use client";
import DarkModeToggle from "./DarkModeToggle";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <h1 className="text-2xl font-bold">RAG Admin</h1>
      <DarkModeToggle />
    </header>
  );
}
