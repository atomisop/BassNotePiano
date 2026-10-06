import { ElasticGallery } from "@/components/ui/elastic-gallery";
import { BACKDROPS } from "@/lib/backdrops";

const small = (url: string) => url.replace("w=2400", "w=1400");

// Piano and guitar are real photos of those instruments. There is no bass
// photo in the app yet, so Bass shows the guitar photo cropped to the neck
// until a real one is added.
const ITEMS = [
  { id: "piano", title: "Piano", src: small(BACKDROPS.curriculum), alt: "A grand piano in a quiet room", href: "/register", position: "center" },
  { id: "guitar", title: "Guitar", src: small(BACKDROPS.guitar), alt: "An acoustic guitar in golden light", href: "/register", position: "center" },
  { id: "bass", title: "Bass", src: small(BACKDROPS.guitar), alt: "The neck of a stringed instrument", href: "/register", position: "20% 50%" },
];

export function InstrumentPicker() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24 md:pb-40">
      <h2 className="sr-only">Piano, guitar and bass</h2>
      <ElasticGallery items={ITEMS} />
    </section>
  );
}
