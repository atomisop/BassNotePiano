import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ClassRegistrationForm } from "./ClassRegistrationForm";

export default function ClassesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Vignette: the H1 floats on the photo, the form below sits in its
          own opaque surface. This is an Operate page, not a Persuade one —
          someone is here to fill in a form, not be sold to — so the type
          stays closer to the rest of the site's scale than the homepage's
          hero, and nothing about the layout competes with the form. */}
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.classes} scrim="vignette" priority sizes="100vw" />
      </div>

      <MarketingNav />

      <section className="relative mx-auto max-w-lg px-6 pb-24 pt-28">
        <div className="text-center">
          <h1 className="text-balance font-serif text-4xl leading-tight tracking-[-0.02em] text-slate-50 sm:text-5xl">
            Learn with us in person
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-slate-200">
            Tell us what you'd like to learn and where you're starting from — we'll follow up by phone or email to
            get you scheduled.
          </p>
        </div>

        <div className="mt-9">
          <ClassRegistrationForm />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
