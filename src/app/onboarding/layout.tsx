import { BrandLogo } from "@/components/ui/BrandLogo";
import { NarrowLayout } from "@/components/layout/PageLayouts";

// The app shell locks the document's own scroll (globals.css), so this screen scrolls inside itself (h-dvh + overflow-y-auto).
// Without that, a tall step is cut off on a small phone and its Next button can never be reached.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="app" className="relative flex h-dvh flex-col overflow-y-auto overscroll-contain">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,_rgba(160,78,30,0.07),_transparent_60%)]"
      />
      <header className="relative flex items-center gap-2.5 px-6 py-6">
        <BrandLogo height={24} className="text-slate-50" />
        {/* Same wordmark treatment as MarketingNav's own (bold, lowercase).
            This was still the pre-Pianote-pass uppercase/split-color
            version. Fully accent-colored at the time; neutral again now
            under the "premium black and white" pass. */}
        <span className="text-small font-bold lowercase tracking-tight text-slate-50">
          Bass Note Piano
        </span>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-6 pb-24">
        <NarrowLayout>{children}</NarrowLayout>
      </main>
    </div>
  );
}
