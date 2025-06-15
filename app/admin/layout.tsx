// app/layout.tsx
import "../globals.css";

export const metadata = {
  title: "My RAG Admin",
  description: "Admin dashboard for email ingestion",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="antialiased">
      <body>{children}</body>
    </html>
  );
}
