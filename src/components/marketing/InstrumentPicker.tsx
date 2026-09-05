import Link from "next/link";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";

/**
 * HOMEPAGE ADDITION: structural pattern borrowed from pickupmusic.com's
 * real landing page ("Choose your instrument": Guitar / Piano / Bass
 * cards), by direct instruction to mirror that page's section flow. Only
 * the shape is borrowed; every word here is BNP's own real fact, not
 * pickupmusic.com's copy: the one true claim available for all three
 * (per PRODUCT.md: "Piano, guitar, and bass all use the same curriculum,
 * correctly voiced per instrument") is what each row actually says,
 * rather than inventing instrument-specific curriculum detail that isn't
 * verified anywhere in this codebase.
 *
 * No per-row card/thumbnail treatment: pickupmusic.com's own cards carry a
 * real photo per instrument, and this app has no equivalent per-instrument
 * photography to justify one, so the rows stay text-forward with the same
 * rule-hairline language the rest of the redesigned sections use, per
 * marketing.css's own "a card is reserved for the product reveal" rule.
 *
 * SECTION BACKDROP: by direct instruction to stop leaving the photography
 * that used to live on /classes, /pricing, /shop and the auth screens
 * unused, and instead use it "casually" behind text already on the
 * homepage. This is the first beat of a repeating image → blur → blank →
 * blur → image rhythm down the page (see ScrollReveal-adjacent sections
 * below): full clarity here, fading through SocialProof's blurred echo of
 * the same photo into Solution's plain, image-free ground. It's the same
 * guitar photo the old /shop page used, a natural fit for "choose your
 * instrument". "dense" scrim (not "vignette"): the text column spans most
 * of the section's width here, not one centered block, so a radial
 * protection zone would leave the row edges under-protected.
 *
 * MOBILE FIX: see SocialProof.tsx's own comment. Same bug, same fix: the
 * label and the row column below only had `md:col-span-*`, no base span,
 * so `.editorial-grid`'s fixed 12-column layout squeezed both into one
 * sliver-width column below md instead of stacking full-width.
 *
 * Every link goes to /register, plainly (not isLoggedIn-aware like Hero's
 * and FinalCTA's own CTAs): there's no verified per-instrument preselect
 * mechanism in this codebase to link to instead, and a returning member
 * clicking through here is a small enough edge case that it doesn't
 * justify promoting this from a server component to a client one just to
 * read the session.
 */
const BACKDROP_SRC = BACKDROPS.guitar;

const INSTRUMENTS = [
  { name: "Piano", note: "The full curriculum, voiced for two hands." },
  { name: "Guitar", note: "The full curriculum, voiced for six strings." },
  { name: "Bass", note: "The full curriculum, voiced for four strings." },
];

export function InstrumentPicker() {
  return (
    <section className="relative overflow-hidden py-[var(--space-5)] md:py-[var(--space-7)]">
      <div aria-hidden className="absolute inset-0 -z-10">
        <PhotoBackdrop src={BACKDROP_SRC} scrim="dense" sizes="100vw" />
      </div>
      <ScrollReveal className="editorial-grid">
        <p className="label label-muted col-span-12 md:col-span-3">Choose your instrument</p>

        <div className="col-span-12 md:col-span-9">
          <h2 className="display-2 max-w-[20ch] text-balance">One curriculum, three instruments.</h2>

          <div className="mt-10">
            <hr className="rule-hairline" />
            {INSTRUMENTS.map((instrument) => (
              <div key={instrument.name}>
                <Link
                  href="/register"
                  className="group flex items-center justify-between gap-6 py-7 transition hover:opacity-80"
                >
                  <div className="flex items-baseline gap-6 sm:gap-10">
                    <h3 className="font-serif text-2xl text-slate-50 sm:text-3xl">{instrument.name}</h3>
                    <p className="max-w-[38ch] text-sm leading-relaxed text-slate-400">{instrument.note}</p>
                  </div>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                    className="shrink-0 text-[rgb(var(--c-s-50))] transition-transform duration-300 group-hover:translate-x-1"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <hr className="rule-hairline" />
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
