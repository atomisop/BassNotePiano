/**
 * Cross-component signal for "a full-screen nav overlay is open",
 * MarketingNav's mobile menu and the dashboard's MoreSheet both render a
 * `fixed inset-0 z-50` panel portaled to `document.body`. Atom
 * (AssistantWidget) is *also* portaled straight to `document.body`, at
 * `z-40`, from providers.tsx, a sibling with no shared ancestor either
 * overlay can reach through props or context.
 *
 * On paper the lower z-index alone should keep Atom's launcher behind
 * either overlay. In practice a visitor reported seeing it float on top of
 * the open mobile menu anyway, and relying solely on a numeric z-index
 * across two independently-portaled fixed elements is exactly the kind of
 * thing that only needs one engine quirk (or one future z-40+ addition
 * somewhere else) to regress silently. Explicitly telling Atom to step
 * aside removes the guesswork.
 *
 * Same same-tab, no-shared-ancestor problem cookieConsent.ts already
 * solves with a window `CustomEvent` (the browser's own `storage` event
 * only fires in *other* tabs), this mirrors that pattern rather than
 * introducing a new Context provider for one boolean.
 */
export const FULLSCREEN_NAV_EVENT = "bnp-fullscreen-nav";

export function setFullscreenNavOpen(open: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<boolean>(FULLSCREEN_NAV_EVENT, { detail: open }));
}

/**
 * Same collision, the other direction. Atom's own open chat panel is
 * *also* a `fixed`, body-portaled element that can claim the same corner
 * of the screen as something else, specifically CookieConsentBanner
 * (`z-[70]`, `fixed inset-x-4 bottom-4` on mobile widening to
 * `sm:right-4`), which has no idea Atom's panel exists and just always
 * renders on top of it. A first-time visitor who opens Atom before
 * deciding on cookies gets the banner sitting over the bottom of the open
 * panel, visually broken, confirmed live.
 *
 * Atom already makes its *greeting bubble* wait for a cookie decision
 * (`CONSENT_DECIDED_EVENT` in cookieConsent.ts), this is that same
 * deference running the other way: while the panel itself is open, the
 * banner steps aside instead, reappearing the moment it closes if a
 * choice still hasn't been made.
 */
export const ATOM_PANEL_OPEN_EVENT = "bnp-atom-panel-open";

export function setAtomPanelOpen(open: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<boolean>(ATOM_PANEL_OPEN_EVENT, { detail: open }));
}
