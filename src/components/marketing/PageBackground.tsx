"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { useReducedMotion } from "framer-motion";

/**
 * Homepage-wide background, per explicit direction: extend the hero's
 * shader background to the whole page, top to bottom — not just the first
 * viewport.
 *
 * `position: fixed` rather than sized to page height: a fixed layer always
 * covers exactly the viewport, at every scroll depth, without needing to
 * know the page's total scroll height (which changes as sections are
 * added/removed) or re-measuring on resize. This is the same trick
 * `GradientFooter`'s own glow band already uses lower on this page.
 *
 * `-z-10` + `aria-hidden`: purely decorative, never part of the a11y tree,
 * always behind real content (every section below renders with no explicit
 * background of its own, so this shows through all of them, same as it
 * previously only showed through Hero).
 *
 * The scrim here is heavier than Hero's old hero-only version — it used to
 * only need to sit behind one badge/headline/CTA stack anchored at the
 * bottom of the frame. Now it sits behind every section's body copy too,
 * at every scroll position, so it leans darker throughout to keep text
 * contrast solid no matter where the moving gradient's lighter patches
 * happen to be.
 */
export function PageBackground() {
  const reduced = useReducedMotion();

  return (
    <div aria-hidden className="fixed inset-0 -z-10 bg-[#1a1a1a]">
      {/* Literal hex, not CSS custom properties — the shader canvas can't
          read `--c-*` at runtime, so these are hand-matched to the new
          black/signal-green identity (`--c-s-950` #1a1a1a, `--c-a-400`
          #05e901) rather than the old warm near-black/rust/amber stops. */}
      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={["#1a1a1a", "#0d2e0a", "#145c0a", "#05e901", "#1a1a1a"]}
        speed={reduced ? 0 : 0.3}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(26,26,26,0.6) 0%, rgba(26,26,26,0.45) 25%, rgba(26,26,26,0.7) 60%, rgba(26,26,26,0.92) 100%)",
        }}
      />
    </div>
  );
}
