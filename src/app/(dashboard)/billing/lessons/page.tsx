import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { FamilyBundleFlow } from "./FamilyBundleFlow";

// Individual (solo) credit purchasing lived here too, until Payment Plans
// (/billing/plans) replaced it entirely, Monthly/3/6/12-month terms now
// cover every case a single buyer needs, including the old one-off/no-
// discount purchase. This page is Family bundle only now: buying the same
// cadence and term at once for 2+ separate, already-existing accounts.
export const metadata = { title: "Class credits" };

export default async function BillingLessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-12">
      <Link
        href="/lessons"
        className="tap w-fit mb-4 flex items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100 lg:col-span-12"
      >
        <ArrowLeftIcon size={16} />
        Back to classes
      </Link>
      <div className="lg:col-span-5">
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Family bundle</h1>
      </div>

      <div className="mt-8 lg:col-span-7 lg:mt-0">
        <div className="glass-surface p-6 sm:p-8">
          <FamilyBundleFlow zelleHandle={zelleHandle} />
        </div>
      </div>
    </div>
  );
}
