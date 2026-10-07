import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { TermsContent, TERMS_LAST_UPDATED } from "@/components/legal/TermsContent";

// noIndex rather than a robots.ts disallow: this page has to stay
// crawlable-by-link (it's the consent target for registration and both
// purchase flows) but it should never rank in place of a marketing page.
export const metadata: Metadata = pageMetadata({
  title: "Terms & refund policy",
  description: "The terms of use and refund policy for Bass Note Piano.",
  path: "/terms",
  noIndex: true,
});

// Public and auth-independent on purpose, this is what registration and
// both purchase flows link to for their required consent checkbox, so it
// has to be reachable before a session exists, not just from the
// signed-in About page's mirrored "Terms & refunds" tab.
export default function TermsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.pricing} scrim="dense" priority sizes="100vw" />
      </div>

      <MarketingNav />

      {/* id + tabIndex: the skip link in (marketing)/layout.tsx targets
          #main-content, axe's "region" check flagged every marketing page
          for having real content outside any landmark, since that id used
          to sit on an empty placeholder div rather than an actual <main>. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-2xl px-6 pb-24 pt-16 sm:pt-24">
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Legal</p>
          <h1 className="mt-1.5 font-serif text-hero text-slate-50">Terms &amp; refund policy</h1>
          <p className="mt-3 text-small text-slate-400">Last updated {TERMS_LAST_UPDATED}.</p>

          <div className="glass-surface mt-8 p-6 sm:p-8">
            <TermsContent />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
