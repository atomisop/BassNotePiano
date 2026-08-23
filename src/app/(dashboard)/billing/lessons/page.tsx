import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { MIN_CUSTOM_QUANTITY, MAX_CUSTOM_QUANTITY } from "@/lib/classCreditPricing";
import { ClassCreditPurchaseFlow } from "./ClassCreditPurchaseFlow";

export default async function BillingLessonsPage({ searchParams }: { searchParams: { quantity?: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");
  // Class credits are an add-on to the curriculum, not a standalone
  // purchase — buy the $69.99 curriculum first, credits after.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=credits");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  // Lets a "Buy credits" button on the pricing page (e.g. ?quantity=20 for
  // Best Value) land the picker already on that bundle instead of always
  // defaulting to Starter and making the student reselect it themselves.
  const parsedQuantity = Number(searchParams.quantity);
  const initialQuantity = Number.isInteger(parsedQuantity)
    ? Math.min(MAX_CUSTOM_QUANTITY, Math.max(MIN_CUSTOM_QUANTITY, parsedQuantity))
    : undefined;

  return (
    <div className="w-full max-w-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Weekly Classes</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Buy class credits</h1>
      <p className="mt-2 text-sm text-slate-500">
        1 credit = 30 minutes of class. $34.99/credit, with bundle discounts up to 30% off at higher quantities.
      </p>

      <div className="mt-6">
        <ClassCreditPurchaseFlow zelleHandle={zelleHandle} initialQuantity={initialQuantity} />
      </div>
    </div>
  );
}
