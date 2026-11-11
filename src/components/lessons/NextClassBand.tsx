import { Children, type ReactNode } from "react";
import { artworkColors } from "@/components/home/RoadmapArtwork";
import { RoadmapKeys } from "@/components/home/RoadmapCard";
import { cn } from "@/lib/utils";

/**
 * Lessons' top band: the next class on a colored sky over piano keys (the day small, the time the biggest thing on the screen), with a
 * light sheet sliding up over its lower edge that holds the controls (Join, Move, More). Same two-layer look as the rest of the app's
 * heroes: a loud colored top and a quiet sheet under it. The band is the same in both themes, so its text is always light.
 */
export function NextClassBand({
  eyebrow = "Next class",
  day,
  time,
  meta,
  children,
  artwork = "dusk",
  className,
}: {
  eyebrow?: string;
  /** "Wednesday, Nov 12", or a plain sentence when nothing is booked. */
  day: string;
  /** "6:00 PM"; omitted when nothing is booked. */
  time?: string;
  meta?: ReactNode;
  /** The controls, drawn on the sheet under the band. */
  children?: ReactNode;
  artwork?: string;
  className?: string;
}) {
  const a = artworkColors(artwork);
  // Children that all rendered nothing (null, false) leave no sheet at all, so the band keeps its own rounded bottom.
  const hasSheet = Children.toArray(children).length > 0;
  // No overflow clipping on the section itself: the More menu in the sheet has to open past the card's edge. Only the colored layer
  // clips (to its own rounded top) and the sheet carries the bottom corners.
  return (
    <section aria-label={eyebrow} className={cn("relative rounded-sheet shadow-raised-mid", className)}>
      <div className={cn("color-tile relative overflow-hidden text-white", hasSheet ? "rounded-t-sheet" : "rounded-sheet")} style={{ background: `linear-gradient(180deg, ${a.from} 0%, ${a.via} 52%, ${a.to} 100%)` }}>
        {/* A dark veil keeps the white text above 4.5:1 on the orange sky and over the keys (the sky alone measured 2.6:1 at the top). */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/30" />
        <div aria-hidden className="absolute inset-0 opacity-60">
          <RoadmapKeys />
        </div>
        <div className={cn("relative px-6 pt-6 md:px-8 md:pt-8", hasSheet ? "pb-12 md:pb-14" : "pb-6 md:pb-8")}>
          <p className="text-small font-medium text-white/90">{eyebrow}</p>
          {time ? (
            <>
              <p className="mt-1 text-body font-medium text-white/95">{day}</p>
              <p className="mt-0.5 text-hero font-bold leading-none tabular-nums">{time}</p>
            </>
          ) : (
            <p className="mt-2 max-w-xl text-headline font-semibold leading-tight text-balance">{day}</p>
          )}
          {meta && <div className="mt-3 text-small text-white/95 [&_*]:!text-white/95">{meta}</div>}
        </div>
      </div>
      {hasSheet && <div className="relative -mt-6 rounded-sheet bg-neu-base px-5 pb-4 pt-1 sm:px-6">{children}</div>}
    </section>
  );
}
