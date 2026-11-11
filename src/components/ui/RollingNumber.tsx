"use client";

import styles from "./RollingNumber.module.css";

/**
 * A formatted number whose digits roll into place when it changes, the way a price or a total does in a good checkout:
 * each digit is a short reel (0 to 9) that slides to the new digit, so the eye sees the change instead of missing it.
 * Pass the text already formatted ("$59.99"). Anything that is not a digit is drawn as it is. Digits are keyed from the
 * right, so "$9.99" growing to "$19.99" keeps the cents in place and only adds a reel on the left.
 * The digits are drawn by CSS, so the DOM text is the price once (an sr-only span).
 *
 * Why it is built this way (all of it was a bug once):
 * - Every piece sits on the text baseline and has the same line height, so a reel never floats above the "$" or the cents.
 *   A reel owns a hidden "0" in normal flow; without real text in its box the browser takes the BOTTOM of the box as its
 *   baseline and every digit rides about 0.2em too high.
 * - The roll is a CSS transition on transform (run by the compositor), not a JS spring per digit. A pricing grid holds
 *   a hundred digits and a Just me / Group flip changes most of them at once; as springs that froze the toggle.
 * - `strike` draws the line itself: `text-decoration: line-through` is not painted through inline-level boxes like these.
 */
export function RollingNumber({ text, className = "", strike = false }: { text: string; className?: string; strike?: boolean }) {
  const chars = [...text];
  return (
    <span className={`${styles.root} ${strike ? styles.strike : ""} ${className}`}>
      {/* The one real copy of the price: read by screen readers and crawlers, and copyable. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden className={styles.row}>
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          if (!/\d/.test(ch)) {
            return (
              <span key={`s-${fromRight}`} className={styles.symbol}>
                {ch}
              </span>
            );
          }
          return <Reel key={`d-${fromRight}`} digit={Number(ch)} />;
        })}
      </span>
    </span>
  );
}

function Reel({ digit }: { digit: number }) {
  return (
    <span className={styles.reel}>
      <span className={styles.strip} style={{ transform: `translateY(${-digit * 10}%)` }} />
    </span>
  );
}
