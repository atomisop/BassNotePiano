import { SOLO_MAX_CREDITS } from "@/lib/classSchedule";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";
import { StaggerCard } from "@/components/marketing/StaggerCard";
import { PhoneCarousel, type PhoneScreenshot } from "@/components/marketing/PhoneCarousel";

/**
 * HOMEPAGE REBUILD: 04 SOLUTION.
 *
 * Retires WhatBassNoteIs (its headline/positioning survives, adapted) and
 * ProductShowcase. Its real screenshots and PhoneCarousel move here as this
 * section's supporting visual, matching "each feature plus benefit plus
 * visual to support it" from the rebuild's own template, since only one
 * real visual asset exists for the whole feature set, not one per feature.
 *
 * Every feature below is real, already-built app functionality, not
 * aspirational copy. Each one traces to a real file: the six-kiñit,
 * twelve-key claim (curriculum.ts's SCALE_GROUPS), native chords needing no
 * separate theory (the same real fact CurriculumOverview's retired "Chords"
 * stage stated, kept here rather than in HowItWorks so the two sections
 * don't repeat it), three-instrument support (the voice-per-instrument work
 * in audio-engine.ts), quiz-gated progression plus badges/streaks
 * (gamification.ts), live one-on-one/family lessons (classSchedule.ts's real
 * credit model), and credits that never expire (the deferred-charge booking
 * model built this session: nothing is charged until attendance, and
 * balances don't decay).
 */
const FEATURES = [
  {
    title: "Six kiñit scales, all twelve keys",
    body: "Tizita, Bati, Anchihoye, Mixolydian, and more, spelled correctly wherever a singer needs them, not just the easy keys.",
  },
  {
    title: "Chords built in, not bolted on",
    body: "Each kiñit's native chords come from its own five notes. There's no separate chord theory to memorize on top of the scale.",
  },
  {
    title: "Piano, guitar, and bass",
    body: "The same curriculum, correctly voiced for your instrument, switchable any time from inside a lesson.",
  },
  {
    title: "Quiz-gated progression",
    body: "Each scale unlocks the next only after you've actually practiced it and passed its quiz, not just clicked through.",
  },
  {
    title: `Live lessons, up to ${(SOLO_MAX_CREDITS * 30) / 60} hour${SOLO_MAX_CREDITS * 30 > 60 ? "s" : ""} at a time`,
    body: "One-on-one with your teacher, or a family session if siblings are learning together, booked on your own schedule over Discord.",
  },
  {
    title: "Credits that never expire",
    body: "Buy once, book whenever. Nothing is charged until the lesson actually happens.",
  },
];

// Only two screenshots, not three: /screenshots/lessons.png is a real capture
// but a stale one, taken before this session's one-on-one/family booking
// rebuild. It still shows the old copy ("up to 10 students per class"),
// which now directly contradicts this same page's own feature list and the
// real /lessons page it was captured from. Showing it as "proof" would be
// showing a real screenshot of something that's no longer true, worse than
// just running the carousel with two. Needs a fresh capture of the current
// /lessons page to come back; flagged to the user rather than faked.
const SCREENSHOTS: PhoneScreenshot[] = [
  {
    src: "/screenshots/dashboard.png",
    alt: "Roadmap dashboard showing scale progress, badges, and practice streak",
  },
  {
    src: "/screenshots/profile.png",
    alt: "Profile page showing streak history and earned badges",
  },
];

export function Solution() {
  return (
    <section id="curriculum" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-12 md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="right">
        <p className="label label-muted">The fix</p>
        <h2 className="display-2 mt-4 max-w-[24ch] text-balance">A spelling engine for Ethiopian music.</h2>
        <p className="lead mt-5 max-w-[52ch] text-slate-300">
          This teaches the underlying grammar instead of one song at a time, so you can play
          anything in the tradition, in any key, correctly.
        </p>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {FEATURES.map((feature, i) => (
            <StaggerCard key={feature.title} index={i}>
              <h3 className="font-serif text-lg text-slate-50">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{feature.body}</p>
            </StaggerCard>
          ))}
        </div>

        <div className="mt-16">
          <p className="text-center text-sm text-slate-500">Real screens from inside Bass Note Piano. Drag or tap to explore.</p>
          <div className="mt-8">
            <PhoneCarousel images={SCREENSHOTS} />
          </div>
        </div>
      </ScrollGlassCard>
    </section>
  );
}
