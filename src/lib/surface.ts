/**
 * The one card material used everywhere content sits on the scroll video.
 *
 * This is a CSS class name rather than a bundle of Tailwind utilities, for two
 * reasons.
 *
 * The first is consistency: the homepage has three families of card (kiñit
 * cards, bento cells, section intros) on the same moving footage. If their
 * fills drift apart the page reads as several designs stacked on one
 * background instead of one system.
 *
 * The second is durability. When these values lived in a utility string inside
 * a *newly created* `.ts` file, Tailwind's watcher did not pick the file up,
 * and the classes were absent from the compiled stylesheet — the card kept its
 * radius and padding and rendered fully transparent. That failure mode is
 * silent and, because this fill is the measured floor holding body copy at
 * 4.5:1 against the video's brightest frame, it degrades contrast rather than
 * just looks. A plain CSS class in a stylesheet the build already tracks has
 * no such dependency on content-scanning.
 *
 * (For the record: opacity utilities themselves are fine in this project —
 * every one currently in source compiles. The earlier theory that only stock
 * scale steps emit was wrong.)
 *
 * The definition lives in globals.css (`.card-surface`), next to
 * `.glass-surface`, which is declared the same way.
 */
export const CARD_SURFACE = "card-surface";

/** Adds the hover border lift. Interactive cards only. */
export const CARD_SURFACE_INTERACTIVE = "card-surface card-surface-hover";
