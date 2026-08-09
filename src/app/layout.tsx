import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { Providers } from "./providers";
import { THEME_BOOT_SCRIPT } from "@/lib/themes";
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
    // suppressHydrationWarning: the boot script below rewrites data-theme /
    // data-mode / data-accent on this element before React hydrates, so the
    // server-rendered markup deliberately won't match. It's the only element
    // affected.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint. Without this the page
            renders in the default theme and then snaps to the stored one —
            the classic dark-mode flash. Has to be inline and synchronous;
            anything deferred is already too late. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        {/* No flat ambient wash here by design — each area (marketing sections,
            auth shell, app shell) sets its own ground. See
            design-system/bass-note-piano/MASTER.md. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
