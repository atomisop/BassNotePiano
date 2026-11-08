import { WordsPullUp } from "@/components/ui/words-pull-up";
import { ElasticGallery } from "@/components/ui/elastic-gallery";
import { BACKDROPS } from "@/lib/backdrops";

// Gallery cards are at most about 700px wide even when opened; 900px at q=70 (Unsplash picks WebP or AVIF) is sharp on a phone and
// about a quarter of the old 1400px download (2026-10-31 speed pass).
const small = (url: string) => url.replace("w=2400&q=80", "w=900&q=70");

// Piano, guitar and bass are all real photos of those instruments.
const ITEMS = [
  { id: "piano", title: "Piano", src: small(BACKDROPS.curriculum), alt: "A grand piano in a quiet room", href: "/register?instrument=piano", position: "center" },
  { id: "guitar", title: "Guitar", src: small(BACKDROPS.guitar), alt: "An acoustic guitar in golden light", href: "/register?instrument=guitar", position: "center" },
  { id: "bass", title: "Bass", src: "/marketing/bass-guitar.jpg", alt: "An electric bass guitar in low light", href: "/register?instrument=bass", position: "center" },
];

export function InstrumentPicker() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-24 md:pb-40 md:pt-40">
      <h2 className="mb-10 text-center">
        <WordsPullUp
          text="Choose your instrument"
          className="justify-center text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1] tracking-display text-cream"
        />
      </h2>
      <ElasticGallery items={ITEMS} />
    </section>
  );
}
