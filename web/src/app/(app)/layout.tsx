import { Geist_Mono, Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeSwitch } from "@/components/app/ThemeSwitch";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import "./app.css";
import "./theme.css";
import "./circles.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-hanken" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme: Theme = saved === "light" || saved === "dark" ? saved : "system";
  return (
    <div
      className={`ferment flex flex-col ${hanken.variable} ${instrument.variable} ${geistMono.variable}`}
      data-theme={theme === "system" ? undefined : theme}
    >
      <div className="flex-1">{children}</div>
      <footer className="mx-auto w-full max-w-2xl px-4 pt-10 pb-6">
        <ThemeSwitch initial={theme} />
      </footer>
    </div>
  );
}
