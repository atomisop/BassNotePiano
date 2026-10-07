import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { LandingPage } from "@/components/marketing/LandingPage";

// The homepage is a client component (session-aware CTAs), and a client
// component cannot export metadata. Rather than give up the route's title/OG
// tags, the interactive part lives in @/components/marketing/LandingPage and
// this server page carries the metadata, the standard App Router split.
//
// No `title`: the root layout's `title.default` already reads "Bass Note Piano,
// Ethiopian Scales, Rhythm & Chords", which is what the homepage wants.
// Passing one here would apply the template and print the wordmark twice.
export const metadata: Metadata = pageMetadata({ path: "/" });

// HOMEPAGE REPLACEMENT: this used to wrap <LandingPage> in
// <ScrollStoryProvider>, the shared scroll signal every pinned/scroll-
// driven scene on the old homepage read from. The new homepage has no
// scroll-driven scenes at all (that was the point of the rebuild), so
// nothing consumes that signal here anymore. ScrollStory.tsx itself is
// untouched, it's not deleted, since removing it is a separate, verified
// decision, not a side effect of this page no longer needing it.
//
export default function Page() {
  return <LandingPage />;
}
