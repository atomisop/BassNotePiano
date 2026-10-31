import { ROADMAP_ARTWORKS, type RoadmapArtwork as ArtworkKey } from "@/lib/roadmapRules";
import { cn } from "@/lib/utils";

/** The colors of a roadmap's picture, falling back to Dusk for an unknown key. */
export function artworkColors(artwork: string) {
  return ROADMAP_ARTWORKS[artwork as ArtworkKey] ?? ROADMAP_ARTWORKS.dusk;
}

/** A small swatch of a roadmap's picture (the admin list, the roadmap strip). */
export function RoadmapArtwork({ artwork, className }: { artwork: string; className?: string }) {
  const a = artworkColors(artwork);
  return <span aria-hidden className={cn("block rounded-lg", className)} style={{ background: `linear-gradient(180deg, ${a.from}, ${a.via} 45%, ${a.to})` }} />;
}
