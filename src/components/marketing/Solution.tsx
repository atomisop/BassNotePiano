import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { SOLO_MAX_CREDITS } from "@/lib/classSchedule";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { SolutionScreenshotTabs } from "@/components/marketing/SolutionScreenshotTabs";

/**
 * HOMEPAGE REDESIGN.
 *
 * No outer glass-surface card: marketing.css's own "STRUCTURE" comment
 * reserves a card for "the product reveal, where a bounded surface is
 * literally what is being shown": that's the screenshot panel specifically
 * (SolutionScreenshotTabs' own rounded border), not the whole section. The
 * text column sits directly on the page, laid out with editorial-grid.
 *
 * Content itself carries over from the earlier 21st.dev-inspired pass:
 * accordion-style features (the real one already in this repo,
 * src/components/ui/accordion.tsx, the same instance FAQ.tsx uses) instead
 * of a static list, and the two real screenshots switching via a floating
 * pill control. This is a plain server component, not "use client":
 * SOLO_MAX_CREDITS comes from @/lib/classSchedule, whose own chain
 * (notifications -> email -> resend) is server-only, Prisma-touching code;
 * the one genuinely interactive part (the screenshot switcher) is its own
 * small client component that takes plain string props instead.
 *
 * Every feature and both images are still exactly what they were before
 * this redesign: real, already-built app functionality and real
 * screenshots, not aspirational copy. See each one's own history in git
 * blame rather than repeating it here.
 *
 * MOBILE FIX: see SocialProof.tsx's own comment for the full explanation.
 * Same bug: both columns here only had `md:col-span-*`, no base span, so
 * `.editorial-grid`'s fixed 12-column layout squeezed the text column and
 * the screenshot panel into one sliver-width column each below md instead
 * of stacking full-width, reported as "mobile is cooked".
 */
const FEATURES = [
  {
    title: "15 scales, all twelve keys",
    body: "Tizita, Bati, Anchihoye, Ambassel, and more, spelled correctly wherever a singer needs them, not just the easy keys.",
  },
  {
    title: "Chords built in, not bolted on",
    body: "Each scale's native chords come from its own five notes. There's no separate chord theory to memorize on top of the scale.",
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
    title: `Live lessons, ${CLASS_MINUTES} minutes one-on-one`,
    body: "One-on-one with your teacher, or a family session if siblings are learning together, booked on your own schedule over Discord.",
  },
  {
    title: "A reserved weekly slot",
    body: "Enroll in a plan and that day and time is yours, every week. Nothing is charged until the lesson actually happens.",
  },
];

// Real captures from inside the app (the demo student "Alex"), retaken for the
// current look. Order tells the story: where you are, how you learn, the three
// virtual instruments and their tools, then classes, progress and settings.
const SCREENS = [
  { key: "roadmap", label: "Roadmap", src: "/screenshots/roadmap.webp", title: "Your roadmap", caption: "Your next step, weekly streak, progress and badges on one screen.", alt: "Roadmap showing the next step, a four day streak, progress and badges" },
  { key: "path", label: "Path", src: "/screenshots/path.webp", title: "Scale by scale", caption: "Fourteen scales, each one unlocked by your teacher as you finish the last.", alt: "List of scales with the current scale's module, practice and quiz progress" },
  { key: "lesson", label: "Lessons", src: "/screenshots/lesson.webp", title: "Video lessons", caption: "Watch the lesson, then practice on the instrument right below it.", alt: "A video lesson with playback controls and a virtual piano underneath" },
  { key: "piano", label: "Piano", src: "/screenshots/piano.webp", title: "Virtual piano", caption: "Tap any key to hear it. The scale lights up in whichever key you choose.", alt: "Virtual piano with the C major scale highlighted" },
  { key: "guitar", label: "Guitar", src: "/screenshots/guitar.webp", title: "Virtual guitar", caption: "The same scale mapped across the fretboard, ready to play along.", alt: "Virtual guitar fretboard showing the scale notes" },
  { key: "bass", label: "Bass", src: "/screenshots/bass.webp", title: "Virtual bass", caption: "Four strings, every note of the scale, one tap to hear it.", alt: "Virtual bass fretboard showing the scale notes" },
  { key: "chords", label: "Chords", src: "/screenshots/chords.webp", title: "Native chords", caption: "Every chord that belongs to the scale, with a play button on each.", alt: "List of the scale's chords with play buttons" },
  { key: "metronome", label: "Metronome", src: "/screenshots/metronome.webp", title: "Built-in metronome", caption: "Set your tempo and time signature without leaving the lesson.", alt: "Metronome with tempo slider and time signature options" },
  { key: "classes", label: "Classes", src: "/screenshots/classes.webp", title: "Live classes", caption: "Book one-on-one time with your teacher, live over Discord.", alt: "Calendar of available live class times with Book buttons" },
  { key: "profile", label: "Profile", src: "/screenshots/profile.webp", title: "Streaks and badges", caption: "Practice daily, earn badges, and watch your streak grow.", alt: "Profile page with the weekly streak and earned badges" },
  { key: "settings", label: "Settings", src: "/screenshots/settings.webp", title: "Your settings", caption: "Notifications, themes, billing and privacy, all in one place.", alt: "Account settings menu" },
  { key: "light", label: "Light mode", src: "/screenshots/light.webp", title: "Light or dark", caption: "Pick the look that suits the room you practice in.", alt: "Roadmap shown in the light theme" },
];

export function Solution() {
  return (
    <section id="curriculum" className="scroll-mt-24 py-[var(--space-5)] md:py-[var(--space-8)]">
      <ScrollReveal className="editorial-grid items-start">
        <div className="col-span-12 md:col-span-6">
          <h2 className="display-2 max-w-[18ch] text-balance">A spelling engine for Ethiopian music.</h2>

          <Accordion type="single" collapsible className="mt-8" defaultValue="feature-0">
            {FEATURES.map((feature, i) => (
              <AccordionItem key={feature.title} value={`feature-${i}`} className="border-ink/10">
                <AccordionTrigger className="text-left font-serif text-body text-slate-50 no-underline hover:no-underline sm:text-body">
                  {feature.title}
                </AccordionTrigger>
                <AccordionContent className="text-small leading-relaxed text-slate-400">{feature.body}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* The one bounded surface in this section, by design: this is
            marketing.css's "product reveal" exception, not a leftover
            card habit. SolutionScreenshotTabs already carries its own
            rounded border for the image itself. */}
        <div className="col-span-12 md:col-span-6 md:col-start-7">
          <SolutionScreenshotTabs screens={SCREENS} defaultKey="roadmap" />
        </div>
      </ScrollReveal>
    </section>
  );
}
