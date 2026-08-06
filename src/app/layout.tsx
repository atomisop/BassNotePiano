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
        {/* No global background here by design — Dynamic Glass assigns a photographic
            backdrop per area (marketing sections, auth shell, app shell) instead of
            one flat ambient wash behind everything. See design-system/bass-note-piano/MASTER.md. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
