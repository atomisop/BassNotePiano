import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { TermsContent, TERMS_LAST_UPDATED } from "@/components/legal/TermsContent";

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

      <MarketingNav />

      <section className="relative mx-auto max-w-2xl px-6 pb-24 pt-16 sm:pt-24">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Legal</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50 sm:text-4xl">Terms &amp; refund policy</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated {TERMS_LAST_UPDATED}.</p>

        <div className="glass-surface mt-8 p-6 sm:p-8">
          <TermsContent />
        </div>
      </section>

      <footer className="relative border-t border-white/10 px-6 py-8 text-center text-xs text-slate-400">
        Bass Note Piano — a digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book.
      </footer>
    </div>
  );
}
