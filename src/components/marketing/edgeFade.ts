import type { CSSProperties } from "react";

/**
 * Shared by every photo-backed homepage section so the break between two
 * sections is one long, soft dissolve into the page ground instead of an edge:
 * the backdrop is fully transparent at the very top and bottom and only
 * reaches full strength well inside the section, so each section's fade-out
 * overlaps the next section's fade-in over the same stretch of ground.
 */
const FADE = "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 14%, black 36%, black 64%, rgba(0,0,0,0.35) 86%, transparent 100%)";

export const EDGE_FADE_STYLE: CSSProperties = {
  maskImage: FADE,
  WebkitMaskImage: FADE,
};
