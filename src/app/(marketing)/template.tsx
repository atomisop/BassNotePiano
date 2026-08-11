import { SmoothScrollProvider } from "@/components/scroll/SmoothScrollProvider";

/**
 * Fade only — deliberately no transform.
 *
 * Each marketing page renders its own <SiteNavbar>, which is
 * `position: fixed`. A transform on this wrapper would make it the
 * containing block for that fixed header, so the nav would stop being
 * pinned to the viewport and scroll away with the page. Opacity creates a
 * stacking context but not a containing block, so it's safe here.
 *
 * Smooth scrolling is mounted here rather than in the root layout so it
 * covers the marketing surface only. The signed-in app has scroll containers
 * of its own (the messaging panes, the admin tables) that should keep native
 * behaviour.
 */
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScrollProvider>
      <div className="page-enter-fade">{children}</div>
    </SmoothScrollProvider>
  );
}
