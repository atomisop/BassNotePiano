import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";
import { PhoneCarousel, type PhoneScreenshot } from "@/components/marketing/PhoneCarousel";

/**
 * HOMEPAGE REPLACEMENT — 04 PRODUCT.
 *
 * Same three real screenshots (public/screenshots/*.png — real in-app
 * captures, not staged mockups). This used to be a plain static row, but
 * that dropped the sideways-swipe browsing phones had before — restored by
 * bringing `PhoneCarousel` back: the real draggable 3D coverflow (direct-
 * manipulation drag, velocity handoff, rubber-banding at the ends), same
 * component the pre-rebuild homepage used it in, just re-wired into this
 * section instead. It's still just a `<PhoneCarousel>` call — the physics
 * live in that file, not here.
 *
 * Only three images, honestly: the doc asked for "curriculum, lesson,
 * scale, progress," but only roadmap/booking/profile screenshots exist for
 * real — a fourth "scale" screenshot isn't faked in to round out the set.
 */

const SCREENSHOTS: PhoneScreenshot[] = [
  {
    src: "/screenshots/dashboard.png",
    alt: "Roadmap dashboard showing scale progress, badges, and practice streak",
  },
  {
    src: "/screenshots/lessons.png",
    alt: "Weekly class booking screen with credit balance and upcoming classes",
  },
  {
    src: "/screenshots/profile.png",
    alt: "Profile page showing streak history and earned badges",
  },
];

export function ProductShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <ScrollGlassCard className="p-8 md:p-12" direction="right">
        <p className="label label-muted">The product</p>
        <h2 className="display-2 mt-4 max-w-[26ch] text-balance">
          Your roadmap, badges, and classes — all in your pocket.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Real screens from inside Bass Note Piano — drag or tap to explore.
        </p>

        <div className="mt-14">
          <PhoneCarousel images={SCREENSHOTS} />
        </div>
      </ScrollGlassCard>
    </section>
  );
}
