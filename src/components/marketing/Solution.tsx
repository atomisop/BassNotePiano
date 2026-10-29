import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { SolutionScreenshotTabs } from "@/components/marketing/SolutionScreenshotTabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { WordsPullUp } from "@/components/ui/words-pull-up";

const FEATURES = [
  {
    title: "Every scale, all twelve keys",
    body: "Each scale is spelled correctly wherever a singer needs it, not just in the easy keys.",
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
    title: "Teacher-approved progression",
    body: "Each scale opens when your teacher approves it, after you've practiced the last one and passed its quiz. Not just clicked through.",
  },
  {
    title: `Live lessons, ${CLASS_MINUTES} minutes one-on-one`,
    body: "One-on-one with your teacher, or a family session if siblings are learning together, live over Discord.",
  },
  {
    title: "A reserved weekly slot",
    body: "Enroll in a plan and that day and time is yours, every week.",
  },
];

const SCREENS = [
  { key: "roadmap", label: "Roadmap", src: "/screenshots/roadmap.webp", title: "Your roadmap", caption: "Your next step, weekly streak, progress and badges on one screen.", alt: "Roadmap showing the next step, a four day streak, progress and badges" },
  { key: "path", label: "Path", src: "/screenshots/path.webp", title: "Scale by scale", caption: "Each scale unlocked by your teacher as you finish the last.", alt: "List of scales with the current scale's module, practice and quiz progress" },
  { key: "lesson", label: "Lessons", src: "/screenshots/lesson.webp", title: "Video lessons", caption: "Watch the lesson, then practice on the instrument right below it.", alt: "A video lesson with playback controls and a virtual piano underneath" },
  { key: "piano", label: "Piano", src: "/screenshots/piano.webp", title: "Virtual piano", caption: "Tap any key to hear it. The scale lights up in whichever key you choose.", alt: "Virtual piano with the C major scale highlighted" },
  { key: "guitar", label: "Guitar", src: "/screenshots/guitar.webp", title: "Virtual guitar", caption: "The same scale mapped across the fretboard, ready to play along.", alt: "Virtual guitar fretboard showing the scale notes" },
  { key: "bass", label: "Bass", src: "/screenshots/bass.webp", title: "Virtual bass", caption: "Four strings, every note of the scale, one tap to hear it.", alt: "Virtual bass fretboard showing the scale notes" },
  { key: "chords", label: "Chords", src: "/screenshots/chords.webp", title: "Native chords", caption: "Every chord that belongs to the scale, with a play button on each.", alt: "List of the scale's chords with play buttons" },
  { key: "metronome", label: "Metronome", src: "/screenshots/metronome.webp", title: "Built-in metronome", caption: "Set your tempo and time signature without leaving the lesson.", alt: "Metronome with tempo slider and time signature options" },
  { key: "classes", label: "Classes", src: "/screenshots/classes.webp", title: "Live classes", caption: "Book time with your teacher, live over Discord.", alt: "Calendar of available live class times with Book buttons" },
  { key: "profile", label: "Profile", src: "/screenshots/profile.webp", title: "Streaks and badges", caption: "Practice daily, earn badges, and watch your streak grow.", alt: "Profile page with the weekly streak and earned badges" },
  { key: "settings", label: "Settings", src: "/screenshots/settings.webp", title: "Your settings", caption: "Notifications, themes, billing and privacy, all in one place.", alt: "Account settings menu" },
  { key: "light", label: "Light mode", src: "/screenshots/light.webp", title: "Light or dark", caption: "Pick the look that suits the room you practice in.", alt: "Roadmap shown in the light theme" },
];

export function Solution() {
  return (
    <section id="curriculum" className="scroll-mt-24 px-2 sm:px-3">
      <div className="mx-auto max-w-[96rem] rounded-2xl bg-black px-6 py-16 md:rounded-[2rem] md:px-14 md:py-28">
        <ScrollReveal className="grid grid-cols-1 items-start gap-14 md:grid-cols-12">
          <div className="min-w-0 md:col-span-6">
            <WordsPullUp
              text="Everything in one place."
              className="text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[1] tracking-[-0.035em] text-cream"
            />
            <Accordion type="single" collapsible className="mt-10" defaultValue="feature-0">
              {FEATURES.map((feature, i) => (
                <AccordionItem key={feature.title} value={`feature-${i}`} className="border-cream/15">
                  <AccordionTrigger className="text-left text-body font-medium text-cream no-underline hover:no-underline">
                    {feature.title}
                  </AccordionTrigger>
                  <AccordionContent className="text-small leading-relaxed text-cream/60">{feature.body}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="min-w-0 md:col-span-6 lg:col-span-5 lg:col-start-8">
            <SolutionScreenshotTabs screens={SCREENS} defaultKey="roadmap" />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
