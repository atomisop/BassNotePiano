import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { CURRICULUM_FAMILY_BUNDLE_DISCOUNT_RATE } from "@/lib/curriculum";
import { CurriculumFamilyBundleFlow } from "./CurriculumFamilyBundleFlow";

// Same shape as billing/lessons's own Family bundle page, for curriculum
// access instead of class credits. No hasCurriculumAccess redirect here,
// unlike that page: curriculum is the base purchase nothing gates, so
// there's no "buy the other thing first" prerequisite to enforce, and the
// buyer doesn't need to already have access themselves (they might be
// buying only for their kids).
export default async function BillingCurriculumFamilyPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/curriculum/family");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  return (
    <div className="w-full max-w-5xl lg:grid lg:grid-cols-12 lg:gap-12">
      <Link
        href="/billing/curriculum"
        className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100 lg:col-span-12"
      >
        <ArrowLeftIcon size={16} />
        Back to curriculum
      </Link>
      <div className="lg:col-span-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Curriculum</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Family bundle</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Unlocking the full curriculum at once for 2 or more separate, already-existing accounts gets an extra{" "}
          {CURRICULUM_FAMILY_BUNDLE_DISCOUNT_RATE * 100}% off the combined total. Each recipient needs their own Bass
          Note Piano account already, since access lands directly on their account, not yours.
        </p>
        <div className="mt-6 space-y-3 border-t border-ink/10 pt-6 text-sm text-slate-400">
          <p className="font-medium text-slate-300">Buying for just your own account?</p>
          <p className="leading-relaxed">
            Use the regular{" "}
            <Link href="/billing/curriculum" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
              one-time unlock
            </Link>{" "}
            instead.
          </p>
        </div>
      </div>

      <div className="mt-8 lg:col-span-7 lg:mt-0">
        <div className="glass-surface p-6 sm:p-8">
          <CurriculumFamilyBundleFlow zelleHandle={zelleHandle} />
        </div>
      </div>
    </div>
  );
}
