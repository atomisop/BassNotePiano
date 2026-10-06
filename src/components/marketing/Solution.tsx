import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { SolutionScreenshotTabs } from "@/components/marketing/SolutionScreenshotTabs";
import { FeatureLoops } from "@/components/marketing/loops";

const SCREENS = [
  { key: "roadmap", label: "Roadmap", src: "/screenshots/roadmap.webp", title: "Your roadmap", caption: "Your next step, streak and badges.", alt: "Roadmap showing the next step, a four day streak, progress and badges" },
  { key: "lesson", label: "Lessons", src: "/screenshots/lesson.webp", title: "Video lessons", caption: "Watch, then practice right below.", alt: "A video lesson with playback controls and a virtual piano underneath" },
  { key: "piano", label: "Piano", src: "/screenshots/piano.webp", title: "Virtual piano", caption: "Tap a key to hear it.", alt: "Virtual piano with the C major scale highlighted" },
  { key: "classes", label: "Classes", src: "/screenshots/classes.webp", title: "Live classes", caption: "Book time with your teacher.", alt: "Calendar of available live class times with Book buttons" },
  { key: "profile", label: "Profile", src: "/screenshots/profile.webp", title: "Streaks and badges", caption: "Practice daily, earn badges.", alt: "Profile page with the weekly streak and earned badges" },
];

// id="curriculum" is where the hero's "Explore curriculum" button scrolls to.
export function Solution() {
  return (
    <section id="curriculum" className="scroll-mt-24 mx-auto w-full max-w-6xl px-6 py-24 md:py-40">
      <h2 className="sr-only">What you get</h2>
      <ScrollReveal className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
        <div className="order-2 min-w-0 md:order-1">
          <SolutionScreenshotTabs screens={SCREENS} defaultKey="roadmap" />
        </div>
        <div className="order-1 min-w-0 md:order-2">
          <FeatureLoops />
        </div>
      </ScrollReveal>
    </section>
  );
}
