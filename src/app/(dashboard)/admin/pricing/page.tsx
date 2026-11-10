import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { getAllSettings } from "@/lib/siteSettings";
import { listAccountDiscounts } from "@/lib/accountDiscounts";
import { PricingManager, type PricingDiscountRow } from "@/components/admin/PricingManager";
import { clearAccountDiscountAction, savePricingAction, searchDiscountCandidatesAction, setAccountDiscountAction, type PricingFormValues } from "./actions";
import { Hint } from "@/components/ui/Hint";
import { SectionPills } from "@/components/admin/SectionPills";
import { ScholarshipsView } from "../scholarships/_view";

export const metadata = { title: "Admin: Pricing" };

async function PricingView() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 data-page-title="" className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Pricing<Hint className="ml-1.5">Only the owner can change prices and discounts.</Hint></h1>
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
      <h1 data-page-title="" className="sr-only">Pricing<Hint className="ml-1.5">What a plan costs, and who gets a percentage off. Every change is recorded in the audit log.</Hint></h1>
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

/** Prices and Scholarships are one page (2026-11-10): both decide what a student pays. */
export default async function AdminPricingPage(props: { searchParams: Promise<{ section?: string }> }) {
  const sp = await props.searchParams;
  const section = sp.section === "scholarships" ? "scholarships" : null;
  return (
    <div>
      <SectionPills base="/admin/pricing" label="Pricing views" active={section} items={[{ label: "Prices", value: null }, { label: "Scholarships", value: "scholarships" }]} />
      {section ? <ScholarshipsView /> : <PricingView />}
    </div>
  );
}
