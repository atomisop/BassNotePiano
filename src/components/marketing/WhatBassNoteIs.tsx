import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

/**
 * HOMEPAGE REPLACEMENT — 02 WHAT BASS NOTE IS.
 *
 * Copy is verbatim from the old homepage's BentoFeatures intro card ("Not a
 * song library. A spelling engine.") — real, existing positioning, not
 * rewritten. No card grid, no bento.
 *
 * The piano-keys photograph this section used to run beside the copy is
 * removed per direct instruction — text-only now, centered, matching the
 * quieter rhythm of the sections around it.
 *
 * Wrapped in `ScrollGlassCard` (real glass, fades/rises in on scroll) — this
 * section and every one below it down through the final CTA, by direct
 * instruction.
 */
export function WhatBassNoteIs() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-20 text-center md:py-28">
      <ScrollGlassCard className="p-8 md:p-12" direction="up">
        <p className="label label-muted">The system</p>
        <h2 className="display-2 mt-4 text-balance">Not a song library. A spelling engine.</h2>
        <p className="lead mx-auto mt-5 max-w-[42ch] text-slate-300">
          Most Ethiopian music resources hand you tabs for individual songs. This teaches the
          underlying grammar — so you can play anything in the tradition, in any key, correctly.
        </p>
      </ScrollGlassCard>
    </section>
  );
}
