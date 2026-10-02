import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { FAMILY_BUNDLE_DISCOUNT_RATE } from "@/lib/classCreditPricing";
import { FamilyBundleFlow } from "./FamilyBundleFlow";

// Individual (solo) credit purchasing lived here too, until Payment Plans
// (/billing/plans) replaced it entirely — Monthly/3/6/12-month terms now
// cover every case a single buyer needs, including the old one-off/no-
// discount purchase. This page is Family bundle only now: buying the same
// cadence and term at once for 2+ separate, already-existing accounts.
export default async function BillingLessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-12">
      <Link
        href="/lessons"
        className="mb-4 flex items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100 lg:col-span-12"
      >
        <ArrowLeftIcon size={16} />
        Back to classes
      </Link>
      <div className="lg:col-span-5">
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Family bundle</h1>
        <p className="mt-3 text-body text-slate-400">
          Buying the same cadence and term at once for 2 or more separate, already-existing accounts gets an extra{" "}
          {FAMILY_BUNDLE_DISCOUNT_RATE * 100}% off the combined total, for a limited time. Each recipient needs their
          own Bass Note Piano account already, since the credits land directly on their account, not yours.
        </p>
        <div className="mt-6 space-y-3 border-t border-ink/10 pt-6 text-small text-slate-400">
          <p className="font-medium text-slate-300">Buying for just your own account?</p>
          <p className="leading-relaxed">
            Use a <Link href="/billing/plans" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">Payment
            Plan</Link> instead — Monthly, 3-Month, or 6-Month, each paid one Zelle installment at a time,
            never all at once.
          </p>
        </div>
      </div>

      <div className="mt-8 lg:col-span-7 lg:mt-0">
        <div className="glass-surface p-6 sm:p-8">
          <FamilyBundleFlow zelleHandle={zelleHandle} />
        </div>
      </div>
    </div>
  );
}
