import { parseAudience, parseParentMode } from "@/lib/planCheckout";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PaymentPlanCadence, PaymentPlanTerm, type ZellePaymentStatus } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFamilyDetails, getActivePaymentPlan, getUserPaymentPlans, getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { getNumberSetting } from "@/lib/siteSettings";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { PaymentPlanEnrollmentFlow } from "./PaymentPlanEnrollmentFlow";
import { MyPlanSummary } from "@/components/billing/MyPlanSummary";
import { getDisplayPricingConfig } from "@/lib/pricing";
import { getPersonalDiscount } from "@/lib/accountDiscounts";
import { PlanHistoryButton } from "@/components/billing/PlanHistoryButton";
import { FamilyInvitesPanel } from "@/components/billing/FamilyInvitesPanel";
import { listInvitesForPerson } from "@/lib/familyInvites";
import { BackLink, PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Payment plans" };

export default async function BillingPlansPage(
  props: {
    searchParams: Promise<{ cadence?: string; term?: string; who?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getServerAuthSession();
  if (!session?.user) {
    // Keep what the pricing page chose (length and who it is for) through sign-in and registration.
    const keep = new URLSearchParams();
    if (searchParams.term) keep.set("term", searchParams.term);
    if (searchParams.who) keep.set("who", searchParams.who);
    const back = keep.size > 0 ? `/billing/plans?${keep}` : "/billing/plans";
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  const firstBillLapseDays = await getNumberSetting("payments.firstBillLapseDays");
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  // Lets a specific tile on the marketing pricing page (PaymentPlanTierGrid,
  // ?cadence=X&term=Y) land the picker already on that combination instead
  // of always defaulting and making the student reselect it, same reasoning
  // the old ?quantity= param on /billing/lessons used to have. Validated
  // against the real enums (query params are just strings) rather than cast.
  const initialCadence = Object.values(PaymentPlanCadence).find((c) => c === searchParams.cadence);
  const initialTerm = Object.values(PaymentPlanTerm).find((t) => t === searchParams.term);
  // "?who=family" from the pricing page's family toggle opens the plan page already on "Me and my family".
  const initialAudience = parseAudience(searchParams.who);
  const initialParentMode = parseParentMode(searchParams.who);

  const [activePlan, allPlans, pricing, personalDiscount] = await Promise.all([
    getActivePaymentPlan(session.user.id),
    getUserPaymentPlans(session.user.id),
    getDisplayPricingConfig(),
    getPersonalDiscount(session.user.id),
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
          // The group's combined bill is shown above as the one bill; only a member's own ordinary bill is listed here.
          if (payment && payment.purpose !== "FAMILY_PLAN_INSTALLMENT") {
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

  // Phones: one column. Tablets and computers: the page is wide, so the plan form can sit in two columns (see NewPlanForm).
  return (
    <div className="mx-auto w-full max-w-2xl md:max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <PageBack href="/lessons" />
        <PlanHistoryButton
          plans={pastPlans.map((plan) => ({
            id: plan.id,
            name: describePaymentPlan(plan.cadence, plan.term),
            billsPaid: plan.installmentsPaid,
            billsTotal: plan.termMonths,
            status: plan.status,
            startedAt: plan.createdAt.toISOString(),
          }))}
        />
      </div>
      <div data-deck-header className="deck-header -mt-4 pt-4 text-center md:text-left">
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment plan</h1>
      </div>

      <div className="mt-8">
        <div className="mx-auto max-w-2xl md:max-w-none">
          <FamilyInvitesPanel invites={(await listInvitesForPerson(session.user.id)).map((i) => ({ id: i.id, payerName: i.payerName }))} />
          {activePlan && <MyPlanSummary userId={session.user.id} />}
        </div>
        <PaymentPlanEnrollmentFlow
          zelleHandle={zelleHandle}
          initialCadence={initialCadence}
          initialTerm={initialTerm}
          initialAudience={initialAudience}
          initialParentMode={initialParentMode}
          pricing={pricing}
          personalDiscountPercent={personalDiscount.percent}
          scholarshipPercent={personalDiscount.scholarshipPercent}
          activePlan={
            activePlan
              ? {
                  id: activePlan.id,
                  cadence: activePlan.cadence,
                  term: activePlan.term,
                  installmentsPaid: activePlan.installmentsPaid,
                  termMonths: activePlan.termMonths,
                  // Until the first payment arrives the weekly time is only held: when it would be let go.
                  heldUntil: activePlan.installmentsPaid === 0 ? new Date(activePlan.createdAt.getTime() + firstBillLapseDays * 86_400_000).toISOString() : null,
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
                  isBundle: shownInstallment.purpose === "FAMILY_PLAN_INSTALLMENT",
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

    </div>
  );
}
