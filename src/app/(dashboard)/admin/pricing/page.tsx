import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { getAllSettings } from "@/lib/siteSettings";
import { listAccountDiscounts } from "@/lib/accountDiscounts";
import { PricingManager, type PricingDiscountRow } from "@/components/admin/PricingManager";
import { clearAccountDiscountAction, savePricingAction, searchDiscountCandidatesAction, setAccountDiscountAction, type PricingFormValues } from "./actions";

export const metadata = { title: "Admin: Pricing" };

export default async function AdminPricingPage() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Pricing</h1>
        <p className="mt-2 text-small text-slate-500">Only the owner can change prices and discounts.</p>
      </div>
    );
  }

  const [settings, discounts] = await Promise.all([getAllSettings(), listAccountDiscounts()]);
  const num = (key: string) => Number(settings.get(key));
  const initial: PricingFormValues = {
    "pricing.monthlyPlanDollars": num("pricing.monthlyPlanDollars"),
    "pricing.term3DiscountPercent": num("pricing.term3DiscountPercent"),
    "pricing.term6DiscountPercent": num("pricing.term6DiscountPercent"),
    "pricing.familyDiscountPercent": num("pricing.familyDiscountPercent"),
    "pricing.extraClassPriceDollars": num("pricing.extraClassPriceDollars"),
    "payments.fifthClassPriceDollars": num("payments.fifthClassPriceDollars"),
  };
  const rows: PricingDiscountRow[] = discounts.map((d) => ({
    userId: d.userId,
    name: d.name,
    email: d.email,
    percent: d.percent,
    note: d.note,
    updatedAt: d.updatedAt.toISOString(),
    plan: d.plan ? { monthlyCents: d.plan.monthlyCents, listCents: d.plan.listCents, cadence: d.plan.label.cadence, term: d.plan.label.term } : null,
  }));

  return (
    <div>
      <h1 className="sr-only">Pricing</h1>
      <p className="mt-2 text-small text-slate-500">What a plan costs, and who gets a percentage off. Every change is recorded in the audit log.</p>
      <div className="mt-6">
        <PricingManager
          initial={initial}
          discounts={rows}
          onSavePricing={savePricingAction}
          onSearch={searchDiscountCandidatesAction}
          onSetDiscount={setAccountDiscountAction}
          onClearDiscount={clearAccountDiscountAction}
        />
      </div>
    </div>
  );
}
