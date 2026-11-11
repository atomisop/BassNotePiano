import type { ReactNode } from "react";
import { artworkColors } from "@/components/home/RoadmapArtwork";
import { RoadmapKeys } from "@/components/home/RoadmapCard";

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
  return (
    <section aria-label={eyebrow} className={`overflow-hidden rounded-sheet shadow-raised-mid ${className ?? ""}`}>
      <div className="color-tile relative overflow-hidden text-white" style={{ background: `linear-gradient(180deg, ${a.from} 0%, ${a.via} 52%, ${a.to} 100%)` }}>
        <RoadmapKeys />
        <div className="relative px-6 pb-12 pt-6 md:px-8 md:pb-14 md:pt-8">
          <p className="text-small font-medium text-white/80">{eyebrow}</p>
          {time ? (
            <>
              <p className="mt-1 text-body font-medium text-white/85">{day}</p>
              <p className="mt-0.5 text-hero font-bold leading-none tabular-nums">{time}</p>
            </>
          ) : (
            <p className="mt-2 max-w-xl text-headline font-semibold leading-tight text-balance">{day}</p>
          )}
          {meta && <div className="mt-3 text-small text-white/80 [&_*]:!text-white/80">{meta}</div>}
        </div>
      </div>
      {children && <div className="relative -mt-6 rounded-t-sheet bg-neu-base px-5 pb-4 pt-1 sm:px-6">{children}</div>}
    </section>
  );
}
