import type { Metadata, Viewport } from "next";
import { Sora, Baloo_2, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { LOGGED_OUT_THEME, THEME_BOOT_SCRIPT, themeGroundColor } from "@/lib/themes";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

// Display and body are two different families now, by direct instruction
// to study a real competitor's design (pianote.com) and match its
// energy: a bold, rounded, friendly display face for headlines, not the
// single geometric-sans-for-everything system this replaces. Baloo 2 is
// the real, freely-licensed Google Font closest to that same rounded,
// heavy-weight character (not pianote.com's own actual typeface, which
// isn't reproduced here: this is an equivalent in the same spirit, the
// same distinction this whole redesign pass draws between copying a
// design's real content vs. its structural/visual style). Sora stays for
// body copy, which wants to stay quiet and readable underneath a heavier
// display face, not compete with it.
const baloo = Baloo_2({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
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

// Tints iOS/Android browser chrome (the strip around the address bar, and
// the strip around the bottom toolbar) to match the app instead of the
// browser's own default gray — without it, that mismatched strip reads as
// an unwanted extra frame around the real UI, worst right below the fixed
// bottom dock where there's no page content left to visually cover it.
// Statically "ink" (not theme-reactive: `viewport` renders on the server,
// which has no access to a signed-in visitor's client-stored theme choice)
// — correct for every logged-out page (marketing/auth are locked to Ink,
// see `LOGGED_OUT_THEME`) and for the default in-app theme; ThemeProvider's
// `applyToDocument` corrects this client-side for a signed-in visitor who's
// actually chosen Paper, the same "server guesses, client corrects before
// paint" split THEME_BOOT_SCRIPT already uses for `data-theme`.
export const viewport: Viewport = {
  themeColor: themeGroundColor(LOGGED_OUT_THEME),
};

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
      className={`${baloo.variable} ${body.variable} ${mono.variable}`}
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
