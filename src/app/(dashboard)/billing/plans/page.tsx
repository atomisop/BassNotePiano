import { redirect } from "next/navigation";
import Link from "next/link";
import { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { getActivePaymentPlan, getUserPaymentPlans, getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { PaymentPlanEnrollmentFlow } from "./PaymentPlanEnrollmentFlow";

export const metadata = { title: "Payment plans" };

export default async function BillingPlansPage(
  props: {
    searchParams: Promise<{ cadence?: string; term?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  // Lets a specific tile on the marketing pricing page (PaymentPlanTierGrid,
  // ?cadence=X&term=Y) land the picker already on that combination instead
  // of always defaulting and making the student reselect it, same reasoning
  // the old ?quantity= param on /billing/lessons used to have. Validated
  // against the real enums (query params are just strings) rather than cast.
  const initialCadence = Object.values(PaymentPlanCadence).find((c) => c === searchParams.cadence);
  const initialTerm = Object.values(PaymentPlanTerm).find((t) => t === searchParams.term);

  const [activePlan, allPlans] = await Promise.all([
    getActivePaymentPlan(session.user.id),
    getUserPaymentPlans(session.user.id),
  ]);

  // Ensures the current installment exists (idempotent) the moment an
  // active plan's own page is viewed, once it's actually within
  // INSTALLMENT_OPEN_LEAD_DAYS of coming due. That gate lives inside
  // getOrCreateOpenInstallmentPayment itself now, shared with the scheduled
  // reminder function, so a student can't pay ahead of schedule installment
  // after installment in one sitting (see that function's own comment).
  const openInstallmentResult = activePlan
    ? await getOrCreateOpenInstallmentPayment(activePlan.id, zelleHandle)
    : null;

  const pastPlans = allPlans.filter((plan) => plan.status !== "ACTIVE");

  // Same split as the family bundle page (STEP 4): the explanation on the
  // left, the form on the right, so the form never stretches across a wide
  // screen. Stacks on smaller screens.
  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-12">
      <Link href="/lessons" className="tap w-fit mb-4 flex items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100 lg:col-span-12">
        <ArrowLeftIcon size={16} />
        Back to classes
      </Link>
      <div className="lg:col-span-5">
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment plan</h1>
      </div>

      <div className="mt-8 lg:col-span-7 lg:mt-0">
        <PaymentPlanEnrollmentFlow
          zelleHandle={zelleHandle}
          initialCadence={initialCadence}
          initialTerm={initialTerm}
          activePlan={
            activePlan
              ? {
                  id: activePlan.id,
                  cadence: activePlan.cadence,
                  term: activePlan.term,
                  installmentsPaid: activePlan.installmentsPaid,
                  termMonths: activePlan.termMonths,
                }
              : null
          }
          openInstallment={
            openInstallmentResult?.payment
              ? {
                  id: openInstallmentResult.payment.id,
                  status: openInstallmentResult.payment.status,
                  rejectionReason: openInstallmentResult.payment.rejectionReason,
                  amountCents: openInstallmentResult.payment.amountCents,
                  installmentNumber: openInstallmentResult.payment.installmentNumber,
                }
              : null
          }
          nextInstallmentDueDate={
            activePlan && !openInstallmentResult?.payment ? (openInstallmentResult?.nextDueDate ?? activePlan.nextDueDate).toISOString() : undefined
          }
        />
      </div>

      {pastPlans.length > 0 && (
        <div className="mt-10 border-t border-ink/10 pt-6 lg:col-span-7 lg:col-start-6">
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Plan history</p>
          <div className="mt-4 space-y-3">
            {pastPlans.map((plan) => (
              <div key={plan.id} className="glass-surface p-4">
                <p className="text-small text-slate-100">{describePaymentPlan(plan.cadence, plan.term)}</p>
                <p className="mt-1 text-small text-slate-500">
                  {plan.installmentsPaid} of {plan.termMonths} installments paid ·{" "}
                  {plan.status === "COMPLETED" ? "Completed" : "Canceled"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
