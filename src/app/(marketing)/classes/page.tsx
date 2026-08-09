import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ClassRegistrationForm } from "./ClassRegistrationForm";

export default function ClassesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.classes} scrim="standard" priority sizes="100vw" />
      </div>

      <MarketingNav />

      <section className="relative mx-auto max-w-lg px-6 pb-24 pt-24">
        <div className="text-center">
          <p className="glass-pill mx-auto mb-4 w-fit px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-300">
            Register for classes
          </p>
          <h1 className="font-serif text-3xl text-slate-50 sm:text-4xl">Learn with us in person</h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-slate-200 sm:text-base">
            Tell us what you'd like to learn and where you're starting from — we'll follow up by phone or email to
            get you scheduled.
          </p>
        </div>

        <div className="mt-8">
          <ClassRegistrationForm />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
