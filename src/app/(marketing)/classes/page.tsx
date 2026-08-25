import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { SiteNavbar } from "@/components/marketing/SiteNavbar";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ClassRegistrationForm } from "./ClassRegistrationForm";

export const metadata: Metadata = pageMetadata({
  title: "Register for a class",
  description:
    "Register for classes learning Ethiopian kiñit on piano, guitar, or bass, at any level, with drums and voice coming soon. No account needed to apply.",
  path: "/classes",
});

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

      <SiteNavbar />

      {/* id + tabIndex: the skip link in (marketing)/layout.tsx targets
          #main-content — see terms/page.tsx for why this moved onto a real
          <main> instead of an empty placeholder div. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-lg px-6 pb-24 pt-28">
          <div className="text-center">
            <h1 className="text-balance font-serif text-4xl leading-tight tracking-[-0.02em] text-slate-50 sm:text-5xl">
              Learn with us via Discord
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-slate-200">
              Tell us what you&apos;d like to learn and where you&apos;re starting from, and we&apos;ll follow up by phone
              or email to get you scheduled.
            </p>
          </div>

          <div className="mt-9">
            <ClassRegistrationForm />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
