"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** How much of each earlier card stays showing above the next one. */
const TIP = 12;
/** At most this many tips stack up; later cards stop at the last place, so a long list never squeezes the card being read. */
const MAX_TIPS = 5;
/** Where the first card stops, against the scroll area's top padding (just under the top bar). */
const START = -8;
/** Where a page heading that stays put stops (its own top padding sits above the bar's edge). */
const HEADER_TOP = -16;
/** Room kept clear above the dock. */
const DOCK_SPACE = 104;

/**
 * The card deck (Home, Roadmap, the admin overview on phones and tablets; Home, Streak and Leaderboard on a computer too): every
 * `.deck-card` slides up and stops under the top bar, the next one is drawn over it, and the earlier cards' top edges stay showing as a
 * stack of tips (globals.css makes them sticky). This works out where each card stops: its tip's place in the stack, or, for a card
 * too tall to fit, low enough that its bottom is seen before it stops. Cards are taken in the order they appear on screen (Home
 * reorders them with CSS `order`). On a computer a screen can have two columns of cards; each column is its own stack.
 */
export function DeckStack() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.getElementById("app-scroll");
    if (!main) return;
    const phone = window.matchMedia("(max-width: 1023px)");
    let frame = 0;

    const layout = () => {
      frame = 0;
      const all = [...main.querySelectorAll<HTMLElement>(".deck-card")];
      // On a computer only the screens that ask for it (`data-deck-desktop`) keep the deck; everywhere else scrolls normally.
      const cards = phone.matches ? all : all.filter((c) => c.closest("[data-deck-desktop]"));
      all.filter((c) => !cards.includes(c)).forEach((c) => c.style.removeProperty("--deck-top"));
      const headerEls = [...main.querySelectorAll<HTMLElement>("[data-deck-header]")];
      if (cards.length === 0) {
        headerEls.forEach((h) => h.style.removeProperty("--deck-top"));
        return;
      }
      const ordered = cards
        .filter((card) => card.offsetHeight > 0)
        .map((card, index) => ({ card, index, order: Number(getComputedStyle(card).order) || 0 }))
        .sort((a, b) => a.order - b.order || a.index - b.index);
      // A sticky `top` counts from the inside of the scroll area's top padding, which already clears the top bar; start the stack a
      // little above that so the first tip tucks right under the bar.
      const padTop = parseFloat(getComputedStyle(main).paddingTop) || 0;
      const floor = main.clientHeight - DOCK_SPACE - padTop;
      // Headings that stay put (Home's greeting; the Scales heading and its tabs row): each sticks under the one before, and the
      // deck starts just under the last.
      const headers = headerEls.filter((h) => h.offsetHeight > 0);
      let start = START;
      if (headers.length > 0) {
        let edge = HEADER_TOP;
        headers.forEach((h) => {
          h.style.setProperty("--deck-top", `${edge}px`);
          edge += h.offsetHeight;
        });
        start = edge + 4;
      }
      // One stack per column: cards that start at the same left edge share a stack (a phone has just the one).
      const column = new Map<number, number>();
      ordered.forEach(({ card }) => {
        const left = phone.matches ? 0 : Math.round(card.getBoundingClientRect().left);
        const i = column.get(left) ?? 0;
        column.set(left, i + 1);
        const top = Math.min(start + Math.min(i, MAX_TIPS) * TIP, floor - card.offsetHeight);
        card.style.setProperty("--deck-top", `${Math.round(top)}px`);
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(layout);
    };

    const sizes = new ResizeObserver(schedule);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(main);
      main.querySelectorAll(".deck-card").forEach((c) => sizes.observe(c));
      schedule();
    };
    // Cards stream in (and lists grow) after the first paint: pick them up as they arrive.
    const added = new MutationObserver(watch);
    added.observe(main, { childList: true, subtree: true });
    phone.addEventListener("change", schedule);
    watch();

    return () => {
      sizes.disconnect();
      added.disconnect();
      phone.removeEventListener("change", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
