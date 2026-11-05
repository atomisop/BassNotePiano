"use client";

import { useCallback } from "react";

/**
 * Moves an element along a curved path instead of a straight line (revamp rule 7): a class flying to its slot, a card to another place.
 * Uses WAAPI on `transform` only, ease-in-out (rule 9), 320 ms, and does nothing under reduced motion (the element just stays where it
 * ends up). The arc bulges perpendicular to the line from start to end by `bulge` of the distance.
 *
 *   const fly = useArc();
 *   fly(el, fromRect, toRect)   // call after the element's real position has already changed (FLIP)
 */
export function useArc(duration = 320, bulge = 0.25) {
  return useCallback(
    (el: HTMLElement | null, from: DOMRect, to: DOMRect) => {
      if (!el || typeof window === "undefined") return null;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) return null;
      // Mid point pushed sideways, perpendicular to the travel direction, upward-biased.
      const nx = -dy / dist;
      const ny = dx / dist;
      const side = ny > 0 ? -1 : 1;
      const mx = dx / 2 + nx * dist * bulge * side;
      const my = dy / 2 + ny * dist * bulge * side;
      return el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: `translate(${mx}px, ${my}px)`, offset: 0.5 },
          { transform: "translate(0, 0)" },
        ],
        { duration, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
      );
    },
    [duration, bulge],
  );
}
