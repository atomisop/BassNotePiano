import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { ClassCreditPurchaseFlow } from "./ClassCreditPurchaseFlow";

export default async function BillingLessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");
  // Class credits are an add-on to the curriculum, not a standalone
  // purchase — buy the $99 curriculum first, credits after.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=credits");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  return (
    <div className="w-full max-w-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Weekly Classes</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Buy class credits</h1>
      <p className="mt-2 text-sm text-slate-500">
        1 credit = 30 minutes of class. $50/credit, with bundle discounts up to 30% off at higher quantities.
      </p>

      <div className="mt-6">
        <ClassCreditPurchaseFlow zelleHandle={zelleHandle} />
      </div>
    </div>
  );
}
