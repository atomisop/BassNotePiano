import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

/**
 * HOMEPAGE REPLACEMENT — 02 WHAT BASS NOTE IS.
 *
 * Positioning carried over from the old homepage's BentoFeatures intro card,
 * headline reworded off its original "Not a song library. A spelling
 * engine." framing (the "it's not X, it's Y" construction reads as templated
 * copy) while keeping the same actual claim. No card grid, no bento.
 *
 * The piano-keys photograph this section used to run beside the copy is
 * removed per direct instruction — text-only now, centered, matching the
 * quieter rhythm of the sections around it.
 *
 * Wrapped in `ScrollGlassCard` (real glass, fades/rises in on scroll) — this
 * section and every one below it down through the final CTA, by direct
 * instruction.
 *
 * `py-12`/`p-6` on mobile, not `py-20`/`p-8` — those larger values are still
 * correct at `md:` and up, but on a ~375px-wide screen they added up to a
 * genuinely empty 160px gap between every section (measured: card-to-card,
 * not a layout bug, just too much of a real thing) plus another ~30% of the
 * screen's own width lost to padding on top of the section's own `px-6`.
 * Every section below repeats this same mobile/desktop split for the same
 * reason, not just this one.
 */
export function WhatBassNoteIs() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-12 text-center md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="up">
        <p className="label label-muted">The system</p>
        <h2 className="display-2 mt-4 text-balance">A spelling engine for Ethiopian music.</h2>
        <p className="lead mx-auto mt-5 max-w-[42ch] text-slate-300">
          Most Ethiopian music resources hand you tabs for individual songs. This teaches the
          underlying grammar, so you can play anything in the tradition, in any key, correctly.
        </p>
      </ScrollGlassCard>
    </section>
  );
}
