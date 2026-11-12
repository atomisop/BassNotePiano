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
import { hasParentControl, isParentOf } from "@/lib/parentLinks";
import { parseSlotKey, pauseNeedsPayment, slotKey } from "@/lib/inPlaceLinks";
import { pauseBlockedReason, isIndefinitePause } from "@/lib/planPause";
import { PlanControls } from "./PlanControls";
import { PlanBillSheet } from "@/components/billing/PlanBillSheet";
import { planBillState } from "@/components/billing/planBillState";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { CalendarClock, CalendarDays, FileText, UserPlus, Users } from "@/components/ui/appIcons";

export const metadata = { title: "Payment plans" };

export default async function BillingPlansPage(
  props: {
    searchParams: Promise<{ cadence?: string; term?: string; who?: string; slot?: string; child?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getServerAuthSession();
  if (!session?.user) {
    // Keep what the pricing page chose (length and who it is for) through sign-in and registration.
    const keep = new URLSearchParams();
    if (searchParams.term) keep.set("term", searchParams.term);
    if (searchParams.who) keep.set("who", searchParams.who);
    if (parseSlotKey(searchParams.slot)) keep.set("slot", searchParams.slot!);
    if (typeof searchParams.child === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(searchParams.child)) keep.set("child", searchParams.child);
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
  // ?slot=<scheduleId>:<chunkIndex>: a weekly time picked somewhere else (Lessons, a "time opened" notice) is already chosen here.
  const pickedSlot = parseSlotKey(searchParams.slot);
  const initialSlotKey = pickedSlot ? slotKey(pickedSlot.scheduleId, pickedSlot.chunkIndex) : null;
  // ?who=parent&child=<userId> (from Parent mode): that child is already on the form. Only a child linked to this parent, so the
  // email is never shown for anyone else's id.
  const initialChildEmail =
    initialParentMode && typeof searchParams.child === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(searchParams.child) && (await isParentOf(session.user.id, searchParams.child))
      ? ((await prisma.user.findUnique({ where: { id: searchParams.child }, select: { email: true } }))?.email.toLowerCase() ?? null)
      : null;

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
  // The group's one combined bill, when the payer's OWN share is covered ($0, so their own plan has no bill to show) but other members still owe.
  let groupBill: Awaited<ReturnType<typeof getOrCreateOpenInstallmentPayment>>["payment"] = null;
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
          if (payment && payment.purpose === "FAMILY_PLAN_INSTALLMENT") groupBill ??= payment;
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
  const shownInstallment = startPayment ?? openInstallmentResult?.payment ?? groupBill ?? null;

  // Pause, change length and cancel, right under the plan (the same controls as Settings). A pause the server would refuse is
  // said up front, and when it is waiting on a payment, the Pay button opens that bill's payment sheet in place.
  const now = new Date();
  const pausedNow = Boolean(activePlan?.pauseUntil && activePlan.pauseUntil > now);
  // A child whose parent controls their schedule changes nothing here (the server refuses it), so they get no dead-end rows.
  const parentControlled = activePlan ? await hasParentControl(session.user.id) : false;
  const controls = activePlan && !parentControlled
    ? {
        plan: {
          cadence: activePlan.cadence,
          term: activePlan.term,
          installmentsPaid: activePlan.installmentsPaid,
          termMonths: activePlan.termMonths,
          installmentAmountCents: activePlan.installmentAmountCents,
          nextDueDate: isIndefinitePause(activePlan) && pausedNow ? null : activePlan.nextDueDate.toISOString(),
          pausedIndefinitely: isIndefinitePause(activePlan) && pausedNow,
          family: activePlan.familyGroupId ? await getFamilyDetails(session.user.id, activePlan) : null,
          pausedAt: activePlan.pausedAt?.toISOString() ?? null,
          pausedUntil: pausedNow && !isIndefinitePause(activePlan) ? activePlan.pauseUntil!.toISOString() : null,
        },
        pauseBlocked:
          shownInstallment?.status === "PENDING_REVIEW"
            ? "Your last payment is still being confirmed. You can pause once it clears."
            : pauseBlockedReason(activePlan, 1, now),
      }
    : null;
  const payable = shownInstallment && (shownInstallment.status === "AWAITING_TRANSFER" || shownInstallment.status === "REJECTED") && !family ? shownInstallment : null;

  const pastPlans = allPlans.filter((plan) => plan.status !== "ACTIVE");

  // With a plan, the screen is about one fact, the next bill: it goes on the band, with Pay on the sheet. (Opened for a child's
  // plan, ?who=parent, the screen is a form instead, so the plan is only a quiet card above it.)
  const showBand = Boolean(activePlan) && !initialParentMode;
  const memberView = family !== null && !family.isPayer;
  const planLabel = activePlan ? describePaymentPlan(activePlan.cadence, activePlan.term) : "";
  const billPlan = activePlan
    ? {
        installmentsPaid: activePlan.installmentsPaid,
        termMonths: activePlan.termMonths,
        // Until the first payment arrives the weekly time is only held: when it would be let go.
        heldUntil: activePlan.installmentsPaid === 0 ? new Date(activePlan.createdAt.getTime() + firstBillLapseDays * 86_400_000).toISOString() : null,
      }
    : null;
  const billInstallment = shownInstallment
    ? {
        id: shownInstallment.id,
        status: shownInstallment.status,
        rejectionReason: shownInstallment.rejectionReason,
        amountCents: shownInstallment.amountCents,
        installmentNumber: shownInstallment.installmentNumber,
        isBundle: shownInstallment.purpose === "FAMILY_PLAN_INSTALLMENT",
      }
    : null;
  const nextInstallmentDueDate = activePlan && !shownInstallment ? (openInstallmentResult?.nextDueDate ?? activePlan.nextDueDate).toISOString() : undefined;

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
      <div data-deck-header className={`deck-header -mt-4 pt-4 ${showBand ? "" : "text-center md:text-left"}`}>
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment plan</h1>
      </div>

      <div className="mt-8">
        <div className="mx-auto max-w-2xl md:max-w-none">
          <FamilyInvitesPanel invites={(await listInvitesForPerson(session.user.id)).map((i) => ({ id: i.id, payerName: i.payerName }))} />
          {activePlan && billPlan && showBand && (
            <div className="mb-6 flex flex-col gap-6">
              <MyPlanSummary
                userId={session.user.id}
                variant="band"
                // The amount on the band is what this person is about to send: their open bill (a group's is everyone's together),
                // or the plan's price per bill between bills. Someone whose group has not started yet owes nothing, so no amount.
                dueCents={memberView ? (family?.waitingForStart ? null : undefined) : (billInstallment?.amountCents ?? undefined)}
                headline={planBillState(billPlan, billInstallment, memberView).label}
              >
                <PlanBillSheet key="bill" planLabel={planLabel} plan={billPlan} installment={billInstallment} group={family} zelleHandle={zelleHandle} nextInstallmentDueDate={nextInstallmentDueDate} covered={activePlan.installmentAmountCents === 0 && !billInstallment} />
              </MyPlanSummary>
              <ActionTiles
                title="What do you want to do?"
                items={[
                  { href: "/billing/history", label: "Payment history", detail: "Bills and receipts", icon: <FileText /> },
                  !activePlan.familyGroupId && activePlan.reservedScheduleId && !parentControlled
                    ? { href: "/lessons?changeTime=", label: "Weekly time", detail: "Change your day", icon: <CalendarClock /> }
                    : { href: "/lessons", label: "My classes", detail: "See what is booked", icon: <CalendarDays /> },
                  { href: "/billing/plans?who=parent", label: "For my child", detail: "Pay for their plan", icon: <Users /> },
                  { href: "/account?tab=account", label: "Invite a friend", detail: "Share your link", icon: <UserPlus /> },
                ]}
              />
              {controls && (
                <PlanControls
                  plan={controls.plan}
                  canPause={!activePlan.familyGroupId}
                  pauseBlocked={controls.pauseBlocked}
                  pauseNeedsPay={pauseNeedsPayment(controls.pauseBlocked) && payable !== null}
                  bill={
                    payable
                      ? {
                          id: payable.id,
                          amountCents: payable.amountCents,
                          title: `Installment ${payable.installmentNumber ?? activePlan.installmentsPaid + 1} of ${activePlan.termMonths}`,
                          eyebrow: planLabel,
                        }
                      : null
                  }
                  zelleHandle={zelleHandle}
                />
              )}
            </div>
          )}
          {activePlan && !showBand && <MyPlanSummary userId={session.user.id} />}
        </div>
        <PaymentPlanEnrollmentFlow
          zelleHandle={zelleHandle}
          initialCadence={initialCadence}
          initialTerm={initialTerm}
          initialAudience={initialAudience}
          initialParentMode={initialParentMode}
          initialSlotKey={initialSlotKey}
          initialChildEmail={initialChildEmail}
          pricing={pricing}
          personalDiscountPercent={personalDiscount.percent}
          scholarshipPercent={personalDiscount.scholarshipPercent}
          billOnBand={showBand}
          activePlan={activePlan && billPlan ? { id: activePlan.id, cadence: activePlan.cadence, term: activePlan.term, ...billPlan } : null}
          openInstallment={billInstallment}
          nextInstallmentDueDate={nextInstallmentDueDate}
          family={family}
          familyBills={familyBills}
          pendingSwitch={pendingSwitch}
        />
      </div>

    </div>
  );
}
