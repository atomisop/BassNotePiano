import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Bass Note Piano",
  description:
    "An interactive masterclass in Ethiopian kiñit — Tizita, Bati, Anchihoye, and Mixolydian pentatonics, spelled correctly in every key.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-amber-500/20 blur-[120px]" />
          <div className="absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full bg-indigo-500/15 blur-[130px]" />
          <div className="absolute bottom-[-220px] left-1/4 h-[480px] w-[480px] rounded-full bg-fuchsia-500/10 blur-[130px]" />
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
