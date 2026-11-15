import { Children, type ReactNode } from "react";
import { artworkColors } from "@/components/home/RoadmapArtwork";
import { RoadmapKeys } from "@/components/home/RoadmapCard";
import { cn } from "@/lib/utils";

/**
 * The app's hero band (DESIGN.md, "Band, sheet and tiles"): one colored sky over piano keys carrying the screen's one big fact, with a
 * quiet sheet sliding up over its lower edge for the controls. At most one per screen. The band is the same in both themes, so its
 * text is always light; a dark veil keeps that text above 4.5:1.
 *
 * `title` is a sentence ("Nothing booked yet"). Give `figure` as well when the fact is a figure (a time, an amount, a count): then
 * `title` is the small line over it and the figure is the biggest thing on the screen.
 */
export function HeroBand({
  eyebrow,
  title,
  figure,
  meta,
  children,
  artwork = "dusk",
  keys = true,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  figure?: ReactNode;
  /** One quiet line under the fact (a `Meta`, or plain text). Drawn light whatever it holds. */
  meta?: ReactNode;
  /** The controls, drawn on the sheet under the band. Children that render nothing leave no sheet. */
  children?: ReactNode;
  /** A roadmap artwork key (dusk, dawn, ...); see `ROADMAP_ARTWORKS`. */
  artwork?: string;
  /** The row of piano keys along the band's foot. */
  keys?: boolean;
  className?: string;
}) {
  const a = artworkColors(artwork);
  const hasSheet = Children.toArray(children).length > 0;
  // No overflow clipping on the section itself: a menu in the sheet has to open past the card's edge. Only the colored layer clips.
  return (
    <section aria-label={eyebrow} className={cn("relative rounded-sheet shadow-raised-mid", className)}>
      {/* Coloured liquid glass (2026-11-14): the section is the glass; the colours are a see-through layer over it. */}
      <div className={cn("color-tile lgx-tinted relative overflow-hidden text-white", hasSheet ? "rounded-t-sheet" : "rounded-sheet")}>
        <span aria-hidden className="lgx-tint-layer" style={{ background: `linear-gradient(180deg, ${a.from} 0%, ${a.via} 52%, ${a.to} 100%)` }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/30" />
        {keys && (
          <div aria-hidden className="absolute inset-0 opacity-60">
            <RoadmapKeys />
          </div>
        )}
        <div className={cn("relative px-6 pt-6 md:px-8 md:pt-8", hasSheet ? "pb-12 md:pb-14" : "pb-6 md:pb-8")}>
          <p className="text-small font-medium text-white/90">{eyebrow}</p>
          {figure !== undefined && figure !== null ? (
            <>
              <p className="mt-1 text-body font-medium text-white/95">{title}</p>
              <p className="mt-0.5 text-hero font-bold leading-none tabular-nums">{figure}</p>
            </>
          ) : (
            <p className="mt-2 max-w-xl text-headline font-semibold leading-tight text-balance">{title}</p>
          )}
          {meta && <div className="mt-3 text-small text-white/95 [&_*]:!text-white/95">{meta}</div>}
        </div>
      </div>
      {hasSheet && <div className="relative -mt-6 rounded-sheet bg-neu-base px-5 pb-4 pt-1 sm:px-6">{children}</div>}
    </section>
  );
}
