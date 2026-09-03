import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { THEME_BOOT_SCRIPT } from "@/lib/themes";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

// One family for both display and body — the black/amber system
// this replaces Playfair Display + Inter with is deliberately not an
// editorial serif-plus-humanist-sans pairing; it's a single geometric
// sans doing every job, the same way the reference spec only ever
// names one font.
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["300", "400", "500", "600", "700"],
});
const body = Sora({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"],
});

// The marketing pages' label voice — eyebrows, scale degrees, formulas, key
// names. System mono resolves to SF Mono / Consolas / DejaVu depending on the
// visitor's OS, which is three different designs for what is a signature
// element of the marketing surface. Two weights only, so the cost stays to a
// single woff2 subset.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

// metadataBase is what turns every relative `openGraph.images` / canonical
// path in the app into an absolute URL. Without it Next emits relative OG
// URLs, which crawlers and link unfurlers (iMessage, Slack, WhatsApp) simply
// drop — the single most common reason a shared link renders as a bare URL.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  // Pages set only their own name; the suffix is applied here so the wordmark
  // never has to be repeated in a page file. `default` covers the homepage,
  // which wants the tagline rather than "Home — Bass Note Piano".
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,

  // Ethiopian spellings are the terms someone actually searches for, and the
  // transliterations vary — so both the ñ form and the plain-ASCII form are
  // present in the copy the crawler sees.
  keywords: [
    "Ethiopian scales",
    "kiñit",
    "kinit",
    "Tizita",
    "Bati",
    "Anchihoye",
    "Ambassel",
    "Ethiopian piano",
    "pentatonic scales",
    "music theory course",
  ],

  // Deliberately no `alternates.canonical` and no `openGraph.url` here.
  // Next merges metadata shallowly, so a canonical set at the root is
  // inherited by every page that doesn't override it — which would have every
  // marketing page declaring itself a duplicate of "/". Each public page
  // sets its own; authenticated pages emit none and are disallowed in
  // robots.ts instead.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },

  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script below rewrites data-theme /
    // data-mode on this element before React hydrates, so the server-
    // rendered markup deliberately won't match. It's the only element
    // affected.
    <html
      lang="en"
      className={`${sora.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
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
