import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PrivacyContent, PRIVACY_LAST_UPDATED } from "@/components/legal/PrivacyContent";

// noIndex for the same reason /terms is: crawlable-by-link (registration
// links here too) without competing with a marketing page for ranking.
export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description: "What Bass Note Piano collects, why, and how to have it corrected or deleted.",
  path: "/privacy",
  noIndex: true,
});

// Public and auth-independent on purpose, same as /terms, reachable from
// the registration consent line before a session exists.
export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.pricing} scrim="dense" priority sizes="100vw" />
      </div>

      <MarketingNav />

      {/* id + tabIndex: the skip link in (marketing)/layout.tsx targets
          #main-content, see terms/page.tsx for why this moved onto a real
          <main> instead of an empty placeholder div. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-2xl px-6 pb-24 pt-28">
          <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Legal</p>
          <h1 className="mt-1 font-serif text-hero text-slate-50">Privacy policy</h1>
          <p className="mt-3 text-small text-slate-500">Last updated {PRIVACY_LAST_UPDATED}.</p>

          <div className="glass-surface mt-8 p-6 sm:p-8">
            <PrivacyContent />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
