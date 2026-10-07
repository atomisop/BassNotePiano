import { PageHitBeacon } from "@/components/marketing/PageHitBeacon";
import "./marketing.css";

/**
 * Scopes the marketing design system to the public-facing routes.
 *
 * `data-surface="marketing"` is the only hook the stylesheet needs. Because
 * the tokens it declares are inherited custom properties on a *descendant* of
 * <html>, they win for this subtree by proximity rather than by specificity,
 * the nearest declaring ancestor supplies the value. So this quietly beats
 * `[data-theme="luxury"]` on <html> without any specificity escalation, and
 * the in-app theme picker keeps working everywhere else, untouched.
 *
 * A layout rather than the existing template.tsx: a template re-mounts on
 * every navigation, and this wrapper has no reason to. The template stays
 * where it is for the page-transition fade and Lenis.
 *
 * ── One known gap ───────────────────────────────────────────────────────
 * Radix portals (the navbar's mobile sheet and its dropdown menu) mount to
 * document.body, which is OUTSIDE this element, so they inherit the luxury
 * ramp and will render with the old white accent. That is fixed when the
 * navigation is rebuilt, by giving the portal content the same attribute.
 * Noting it here so it is not mistaken for a scoping bug later.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Always the dark "ink" theme here: the public pages have one look, whatever
  // light or dark theme a signed-in visitor picked for the app.
  return (
    <div data-surface="marketing" data-theme="ink" data-mode="dark" style={{ colorScheme: "dark" }}>
      {/* STEP 17, a keyboard user landing on this page otherwise has to tab
          through the full nav, then several long pinned-scroll 3D/SVG
          scenes, before reaching anything else, this jumps straight past
          all of it to #main-content (set on LandingPage's first real
          content section). Visually hidden until it receives focus, the
          standard pattern; a sighted mouse user never sees it. */}
      {/* Reuses .btn/.btn-primary rather than hand-rolling colors, same
          token pairing (rgb(--c-s-50) fill, rgb(--c-s-950) text) every
          other primary CTA on the page already uses, not a new one-off. */}
      <a href="#main-content" className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]">
        Skip to main content
      </a>
      <PageHitBeacon />
      {children}
    </div>
  );
}
