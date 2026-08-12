import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { SiteNavbar } from "@/components/marketing/SiteNavbar";
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

// Public and auth-independent on purpose — this is what registration and
// both purchase flows link to for their required consent checkbox, so it
// has to be reachable before a session exists, not just from the
// signed-in About page's mirrored "Terms & refunds" tab.
export default function TermsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.pricing} scrim="dense" priority sizes="100vw" />
      </div>

      <SiteNavbar />

      <section className="relative mx-auto max-w-2xl px-6 pb-24 pt-16 sm:pt-24">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Legal</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50 sm:text-4xl">Terms &amp; refund policy</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated {TERMS_LAST_UPDATED}.</p>

        <div className="glass-surface mt-8 p-6 sm:p-8">
          <TermsContent />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
