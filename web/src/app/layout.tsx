import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import "./ferment.css";
import { PROJECT_NAME } from "@/lib/brand";

// Fraunces for headlines (soft and wonky, so it carries those two axes), Hanken
// Grotesk for everything else, Geist Mono for counts and states.
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], axes: ["SOFT", "WONK", "opsz"], variable: "--font-fraunces" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-hanken" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: `${PROJECT_NAME} — culture is grown in conversation`,
  description:
    "Invite your people, pick what matters, and gather in small circles to talk it through. What a circle finds is shared with the gathering, and good conversations travel on.",
  appleWebApp: { capable: true, title: PROJECT_NAME },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${fraunces.variable} ${hanken.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
