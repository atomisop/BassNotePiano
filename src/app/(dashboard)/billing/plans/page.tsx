import { redirect } from "next/navigation";
import Link from "next/link";
import { PaymentPlanCadence, PaymentPlanTerm, type ZellePaymentStatus } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFamilyDetails, getActivePaymentPlan, getUserPaymentPlans, getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { PaymentPlanEnrollmentFlow } from "./PaymentPlanEnrollmentFlow";
import { MyPlanSummary } from "@/components/billing/MyPlanSummary";
import { getPricingConfig } from "@/lib/pricing";
import { getDiscountPercent } from "@/lib/accountDiscounts";
import { BackLink } from "@/components/ui/BackLink";

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

  const [activePlan, allPlans, pricing, personalDiscountPercent] = await Promise.all([
    getActivePaymentPlan(session.user.id),
    getUserPaymentPlans(session.user.id),
    getPricingConfig(),
    getDiscountPercent(session.user.id),
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

  // A family plan: who pays, whether the family has started, and (for the payer) the combined first payment and the other
  // members' monthly bills.
  let family: { isPayer: boolean; payerName: string | null; memberCount: number; waitingForStart: boolean; memberNames: string[]; weeklyTime: string | null } | null = null;
  let startPayment: Awaited<ReturnType<typeof prisma.zellePayment.findFirst>> = null;
  const familyBills: { planId: string; memberName: string; payment: { id: string; status: ZellePaymentStatus; rejectionReason: string | null; amountCents: number; installmentNumber: number | null } }[] = [];
  if (activePlan?.familyGroupId) {
    const group = await prisma.familyPlanGroup.findUnique({
      where: { id: activePlan.familyGroupId },
      select: {
        payerId: true,
        payer: { select: { name: true, email: true } },
        plans: { where: { status: "ACTIVE" }, select: { id: true, userId: true, user: { select: { name: true, email: true } } } },
      },
    });
    if (group) {
      const isPayer = group.payerId === session.user.id;
      const waitingForStart = activePlan.installmentsPaid === 0;
      const details = await getFamilyDetails(session.user.id, activePlan);
      family = { isPayer, payerName: group.payer.name ?? group.payer.email, memberCount: group.plans.length, waitingForStart, memberNames: details?.memberNames ?? [], weeklyTime: details?.weeklyTime ?? null };
      if (isPayer && waitingForStart) {
        startPayment = await prisma.zellePayment.findFirst({
          where: { familyGroupId: activePlan.familyGroupId, purpose: "FAMILY_PLAN_START", status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW", "REJECTED"] } },
          orderBy: { createdAt: "desc" },
        });
      }
      if (isPayer && !waitingForStart) {
        for (const member of group.plans.filter((plan) => plan.userId !== session.user.id)) {
          const { payment } = await getOrCreateOpenInstallmentPayment(member.id, zelleHandle);
          if (payment) {
            familyBills.push({
              planId: member.id,
              memberName: member.user.name ?? member.user.email,
              payment: { id: payment.id, status: payment.status, rejectionReason: payment.rejectionReason, amountCents: payment.amountCents, installmentNumber: payment.installmentNumber },
            });
          }
        }
      }
    }
  }
  // A switch from this solo plan to a family plan, waiting for its combined first payment.
  let pendingSwitch: { payment: { id: string; status: ZellePaymentStatus; rejectionReason: string | null; amountCents: number; installmentNumber: number | null }; memberCount: number } | null = null;
  if (activePlan && !activePlan.familyGroupId) {
    const group = await prisma.familyPlanGroup.findFirst({
      where: { payerId: session.user.id, replacesPlanId: activePlan.id, plans: { some: { status: "ACTIVE", installmentsPaid: 0 } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, _count: { select: { plans: true } } },
    });
    if (group) {
      const open = await prisma.zellePayment.findFirst({
        where: { familyGroupId: group.id, purpose: "FAMILY_PLAN_START", status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW", "REJECTED"] } },
        orderBy: { createdAt: "desc" },
      });
      if (open) {
        pendingSwitch = {
          payment: { id: open.id, status: open.status, rejectionReason: open.rejectionReason, amountCents: open.amountCents, installmentNumber: 1 },
          memberCount: group._count.plans + 1,
        };
      }
    }
  }
  const shownInstallment = startPayment ?? openInstallmentResult?.payment ?? null;

  const pastPlans = allPlans.filter((plan) => plan.status !== "ACTIVE");

  // Same split as the family bundle page (STEP 4): the explanation on the
  // left, the form on the right, so the form never stretches across a wide
  // screen. Stacks on smaller screens.
  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-12">
      <BackLink href="/lessons" className="tap w-fit mb-4 flex items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100 lg:col-span-12">
        <ArrowLeftIcon size={16} />
        Back
      </BackLink>
      <div className="lg:col-span-5">
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment plan</h1>
      </div>

      <div className="mt-8 lg:col-span-7 lg:mt-0">
        {activePlan && <MyPlanSummary userId={session.user.id} />}
        <PaymentPlanEnrollmentFlow
          zelleHandle={zelleHandle}
          initialCadence={initialCadence}
          initialTerm={initialTerm}
          pricing={pricing}
          personalDiscountPercent={personalDiscountPercent}
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
            shownInstallment
              ? {
                  id: shownInstallment.id,
                  status: shownInstallment.status,
                  rejectionReason: shownInstallment.rejectionReason,
                  amountCents: shownInstallment.amountCents,
                  installmentNumber: shownInstallment.installmentNumber,
                }
              : null
          }
          nextInstallmentDueDate={
            activePlan && !shownInstallment ? (openInstallmentResult?.nextDueDate ?? activePlan.nextDueDate).toISOString() : undefined
          }
          family={family}
          familyBills={familyBills}
          pendingSwitch={pendingSwitch}
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
