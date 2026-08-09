/**
 * Fade only — deliberately no transform.
 *
 * Each marketing page renders its own <MarketingNav>, which is
 * `position: fixed`. A transform on this wrapper would make it the
 * containing block for that fixed header, so the nav would stop being
 * pinned to the viewport and scroll away with the page. Opacity creates a
 * stacking context but not a containing block, so it's safe here.
 */
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter-fade">{children}</div>;
}
