import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ClassRegistrationForm } from "./ClassRegistrationForm";
import { SeeItWork } from "@/components/marketing/SeeItWork";

export const metadata: Metadata = pageMetadata({
  title: "Register for a class",
  description:
    "Register for classes learning Ethiopian scales on piano, guitar, or bass, at any level, with drums and voice coming soon. Send your details and an instructor will reach out.",
  path: "/classes",
});

export default function ClassesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <MarketingNav />

      {/* id + tabIndex: the skip link in (marketing)/layout.tsx targets
          #main-content, see terms/page.tsx for why this moved onto a real
          <main> instead of an empty placeholder div. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-lg px-6 pb-24 pt-28">
          <div className="text-center">
            <h1 className="text-balance font-serif text-hero leading-tight tracking-tight text-slate-50">
              Learn with us via Discord
            </h1>
            {/* What sending the form does, in one quiet line, so the form under it needs no introduction of its own. */}
            <p className="mx-auto mt-3 max-w-sm text-pretty text-body text-slate-400">
              Send your details and an instructor will reach out.
            </p>
          </div>

          <div className="mt-8">
            <ClassRegistrationForm />
          </div>
        </section>

        <SeeItWork />
      </main>

      <SiteFooter />
    </div>
  );
}
