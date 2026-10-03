import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { EDGE_FADE_STYLE } from "./edgeFade";

/**
 * HOMEPAGE REBUILD: 03 PROBLEM STATEMENT.
 *
 * Real, not invented: this is the same gap WhatBassNoteIs (now retired,
 * folded into Solution.tsx) already named in its own copy, just stated as
 * the cost of the problem first instead of leading with the fix. Nothing
 * new claimed here; every sentence traces to the same "most resources are
 * song-specific tabs, not a system" positioning this app has used since the
 * original homepage.
 *
 * REDESIGN: no glass-surface card. A short, centered statement is already
 * the simplest thing on the page; boxing it in a card added a visual
 * boundary this content never needed. It deliberately doesn't get
 * SocialProof's or Solution's editorial-grid treatment either: one plain
 * centered beat between two more structured sections reads as a breath,
 * not a gap in the system.
 *
 * SECTION BACKDROP: fourth beat of the homepage's image → blur → blank →
 * blur → image rhythm (see InstrumentPicker's own comment). This section
 * is the second full-clarity peak, using the same vintage-sheet-music
 * photo the old /classes page used, a literal match for a section about
 * the limits of tab/sheet-based learning. "vignette" scrim, not "dense":
 * unlike InstrumentPicker, this content really is one narrow centered
 * column, exactly the shape vignette's radial protection is built for.
 */
export function ProblemStatement() {
  return (
    <section className="relative overflow-hidden py-[var(--space-5)] md:py-[var(--space-7)]">
      <div aria-hidden className="absolute inset-0 -z-10" style={EDGE_FADE_STYLE}>
        <PhotoBackdrop src={BACKDROPS.classes} scrim="vignette" sizes="100vw" />
      </div>
      <ScrollReveal className="mx-auto max-w-2xl px-6 text-center">
        <p className="label label-muted">The gap</p>
        <h2 className="display-2 mt-4 text-balance">Tabs teach you one song. Not the language.</h2>
        <p className="lead mx-auto mt-5 max-w-[46ch]">
          Most Ethiopian music resources hand you a transcription of one specific piece. Learn it,
          and you can play that one song, in that one key. Try to play anything new, jam with
          someone, or transpose for a singer, and you&apos;re stuck: you memorized shapes, not the
          scale grammar underneath them.
        </p>
      </ScrollReveal>
    </section>
  );
}
