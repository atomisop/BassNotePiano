"use client";

/**
 * A local pool of shade that sits behind one block of text.
 *
 * The homepage's first pass protected type with a single flat 84% wash over
 * the whole video. That clears contrast everywhere, but it pays for it
 * everywhere too — including the large empty regions where no text sits, which
 * is most of the frame. The result reads as muddy footage rather than as
 * footage with legible text on it, and it is the main reason a 4K source can
 * look soft: it isn't resolution, it's the veil.
 *
 * This inverts the trade. The global wash drops to a light tint so the image
 * stays vivid, and each text block carries its own shade, sized to itself and
 * falling off to nothing at the edges. Contrast is then guaranteed exactly
 * where it is needed and nowhere else.
 *
 * The same reasoning already exists in this codebase for photographs — see
 * `.backdrop-scrim-vignette` in globals.css, which asks "where does text
 * actually touch the image" instead of protecting the whole frame.
 */

interface TextShelfProps {
  /**
   * `pool` — a soft radial for centred blocks (hero, section intros).
   * `edge` — a horizontal ramp for copy anchored to a screen margin.
   */
  variant?: "pool" | "edge";
  /** Which margin the copy is anchored to. `edge` only. */
  side?: "left" | "right";
  /** Peak opacity at the centre. 0.74 is the measured floor for AA body copy. */
  strength?: number;
  className?: string;
}

export function TextShelf({
  variant = "pool",
  side = "left",
  strength = 0.74,
  className = "",
}: TextShelfProps) {
  const background =
    variant === "pool"
      ? `radial-gradient(58% 62% at 50% 50%, rgb(var(--c-s-950) / ${strength}) 0%, rgb(var(--c-s-950) / ${(
          strength * 0.6
        ).toFixed(3)}) 48%, transparent 78%)`
      : `linear-gradient(to ${side === "left" ? "right" : "left"}, rgb(var(--c-s-950) / ${strength}) 0%, rgb(var(--c-s-950) / ${(
          strength * 0.72
        ).toFixed(3)}) 46%, transparent 88%)`;

  return (
    <div
      aria-hidden
      // Generous negative inset so the falloff happens outside the text's own
      // box — a shelf that stops at the text edge reads as a visible rectangle.
      className={`pointer-events-none absolute -inset-x-16 -inset-y-14 -z-10 ${className}`}
      style={{ background }}
    />
  );
}
