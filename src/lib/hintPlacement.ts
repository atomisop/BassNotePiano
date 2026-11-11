// Where an "i" popover (Hint) goes, as pure maths so it can be tested: the popover opens on the side and edge the caller asked for,
// then is nudged so ALL of it stays on the screen. An "i" near the right edge of a phone used to open to the right and run off
// the screen; now it slides left to fit, flips above the "i" when there is no room below, and shrinks to the screen when it is wider.

export type Box = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type HintSide = "bottom" | "top";
export type HintAlign = "left" | "right" | "center";

/** The space kept between the popover and the edge of the screen. */
export const HINT_MARGIN = 12;
/** The space between the "i" and its popover. */
export const HINT_GAP = 6;
/** The widest a hint opens (16rem). */
export const HINT_WIDTH = 256;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** How wide the popover is on a screen this wide: its usual width, or the screen less the margins when the screen is narrower. */
export function hintWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(HINT_WIDTH, viewportWidth - HINT_MARGIN * 2));
}

export interface HintPlacement {
  left: number;
  top: number;
  /** Set only when the popover is taller than the screen: it scrolls inside this height. */
  maxHeight: number | null;
  side: HintSide;
}

/**
 * `anchor` is the "i" button's box and `size` the popover's measured size, both in screen (viewport) coordinates, as is the result,
 * which is meant for `position: fixed`.
 */
export function placeHint(anchor: Box, size: Size, viewport: Size, side: HintSide = "bottom", align: HintAlign = "left"): HintPlacement {
  const usable = Math.max(0, viewport.height - HINT_MARGIN * 2);
  const height = Math.min(size.height, usable);
  const tooTall = size.height > usable;

  const wanted = align === "right" ? anchor.right - size.width : align === "center" ? (anchor.left + anchor.right) / 2 - size.width / 2 : anchor.left;
  const left = clamp(wanted, HINT_MARGIN, Math.max(HINT_MARGIN, viewport.width - HINT_MARGIN - size.width));

  const roomBelow = viewport.height - HINT_MARGIN - (anchor.bottom + HINT_GAP);
  const roomAbove = anchor.top - HINT_GAP - HINT_MARGIN;
  let chosen = side;
  if (side === "bottom" && height > roomBelow && roomAbove > roomBelow) chosen = "top";
  else if (side === "top" && height > roomAbove && roomBelow > roomAbove) chosen = "bottom";

  const wantedTop = chosen === "top" ? anchor.top - HINT_GAP - height : anchor.bottom + HINT_GAP;
  const top = clamp(wantedTop, HINT_MARGIN, Math.max(HINT_MARGIN, viewport.height - HINT_MARGIN - height));

  return { left, top, maxHeight: tooTall ? usable : null, side: chosen };
}
