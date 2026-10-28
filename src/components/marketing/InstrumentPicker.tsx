import { WordsPullUp } from "@/components/ui/words-pull-up";
import { ElasticGallery } from "@/components/ui/elastic-gallery";
import { BACKDROPS } from "@/lib/backdrops";

const small = (url: string) => url.replace("w=2400", "w=1400");

// Piano, guitar and bass are all real photos of those instruments.
const ITEMS = [
  { id: "piano", title: "Piano", src: small(BACKDROPS.curriculum), alt: "A grand piano in a quiet room", href: "/register", position: "center" },
  { id: "guitar", title: "Guitar", src: small(BACKDROPS.guitar), alt: "An acoustic guitar in golden light", href: "/register", position: "center" },
  { id: "bass", title: "Bass", src: "/marketing/bass-guitar.jpg", alt: "An electric bass guitar in low light", href: "/register", position: "center" },
];

export function InstrumentPicker() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-24 md:pb-40 md:pt-40">
      <h2 className="mb-10 text-center">
        <WordsPullUp
          text="Choose your instrument"
          className="justify-center text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1] tracking-[-0.035em] text-[#E1E0CC]"
        />
      </h2>
      <ElasticGallery items={ITEMS} />
    </section>
  );
}
