import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

/**
 * HOMEPAGE REBUILD: 03 PROBLEM STATEMENT.
 *
 * Real, not invented: this is the same gap WhatBassNoteIs (now retired,
 * folded into Solution.tsx) already named in its own copy, just stated as
 * the cost of the problem first instead of leading with the fix. Nothing
 * new claimed here; every sentence traces to the same "most resources are
 * song-specific tabs, not a system" positioning this app has used since the
 * original homepage.
 */
export function ProblemStatement() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-12 text-center md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="up">
        <p className="label label-muted">The gap</p>
        <h2 className="display-2 mt-4 text-balance">Tabs teach you one song. Not the language.</h2>
        <p className="lead mx-auto mt-5 max-w-[46ch] text-slate-300">
          Most Ethiopian music resources hand you a transcription of one specific piece. Learn it,
          and you can play that one song, in that one key. Try to play anything new, jam with
          someone, or transpose for a singer, and you&apos;re stuck: you memorized shapes, not the
          scale grammar underneath them.
        </p>
      </ScrollGlassCard>
    </section>
  );
}
