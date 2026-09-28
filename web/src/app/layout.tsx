import type { Metadata } from "next";
import "./globals.css";
import { PROJECT_NAME } from "@/lib/brand";

// Type is system-resident, as in the circles app: Iowan Old Style for display,
// Seravek for everything else. Nothing fetched.
export const metadata: Metadata = {
  title: `${PROJECT_NAME} — tools for becoming community`,
  description:
    "A circle is a small group that thinks together, each on their own time. Propose a question, see who joins, and share what you find with the wider community.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
