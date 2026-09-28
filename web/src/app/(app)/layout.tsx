import { Geist_Mono, Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import "./app.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-hanken" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ferment ${hanken.variable} ${instrument.variable} ${geistMono.variable}`}>
      {children}
    </div>
  );
}
