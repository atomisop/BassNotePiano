import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { LandingPage } from "@/components/marketing/LandingPage";

// The homepage is a client component (scroll-driven video, session-aware CTA),
// and a client component cannot export metadata. Rather than give up the
// route's title/OG tags, the interactive part lives in
// @/components/marketing/LandingPage and this server page carries the
// metadata — the standard App Router split.
//
// No `title`: the root layout's `title.default` already reads "Bass Note Piano
// — Ethiopian Scales, Rhythm & Chords", which is what the homepage wants.
// Passing one here would apply the template and print the wordmark twice.
export const metadata: Metadata = pageMetadata({ path: "/" });

export default function Page() {
  return <LandingPage />;
}
