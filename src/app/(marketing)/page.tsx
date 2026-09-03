import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { LandingPage } from "@/components/marketing/LandingPage";

// The homepage is a client component (session-aware CTAs), and a client
// component cannot export metadata. Rather than give up the route's title/OG
// tags, the interactive part lives in @/components/marketing/LandingPage and
// this server page carries the metadata — the standard App Router split.
//
// No `title`: the root layout's `title.default` already reads "Bass Note Piano
// — Ethiopian Scales, Rhythm & Chords", which is what the homepage wants.
// Passing one here would apply the template and print the wordmark twice.
export const metadata: Metadata = pageMetadata({ path: "/" });

// HOMEPAGE REPLACEMENT: this used to wrap <LandingPage> in
// <ScrollStoryProvider> — the shared scroll signal every pinned/scroll-
// driven scene on the old homepage read from. The new homepage has no
// scroll-driven scenes at all (that was the point of the rebuild), so
// nothing consumes that signal here anymore. ScrollStory.tsx itself is
// untouched — it's not deleted, since removing it is a separate, verified
// decision, not a side effect of this page no longer needing it.
//
// HUD HERO: the two font <link> tags below (Orbitron-Medium from a
// third-party CDN, Google Fonts Inter) are for Hero.tsx's HUD hero
// specifically; see that file's own comment. Rendered from this real
// Server Component rather than from Hero.tsx itself (a Client Component)
// because Next.js's automatic <head> hoisting for <link> tags is
// documented for Server Components, not reliably for Client Components.
export default function Page() {
  return (
    <>
      {/* eslint-disable @next/next/no-page-custom-font --
          this rule is a Pages Router holdover ("only load for a single
          page" is a warning there, since _document.js is the only place
          meant to affect every page); in App Router, a page-level <link>
          loading only on this one page is the correct, idiomatic behavior,
          not a bug: these fonts are deliberately scoped to just this
          route, not the whole app. */}
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/b1314443e183d1cdd77049077c46facc?family=Orbitron-Medium" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" />
      {/* eslint-enable @next/next/no-page-custom-font */}
      <LandingPage />
    </>
  );
}
