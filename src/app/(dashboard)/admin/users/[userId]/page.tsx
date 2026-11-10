import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/lib/adminCustomer";
import { CustomerProfile } from "@/components/admin/CustomerProfile";
import { setCurriculumAccessAction, toggleScaleUnlockAction, clearAssistantHistoryAction, setUserRoleAction } from "../actions";
import { adjustUserCreditsAction } from "../../payments/credit-actions";
import { adminCancelBookingAction, adminMoveBookingAction, adminMoveBookingToTimeAction, adminBookClassAction, getOpenSlotsAction, markAttendanceAction, undoAttendanceAction, setClassInPersonAction } from "../../schedule/actions";
import { StudentScheduler } from "@/components/admin/StudentScheduler";
import { adminClearPhoneAction, adminForceSignOutAction, banUserAction, forgetPayerNameAction, liftPaymentLockAction, unbanUserAction } from "./actions";
import { BackLink, PageBack } from "@/components/ui/BackLink";
import { prisma } from "@/lib/prisma";
import { accountAuditWhere } from "@/lib/accountAudit";
import type { ReactNode } from "react";
import { ActionMenu, ActionMenuLabel } from "@/components/ui/ActionMenu";
import { ChevronRight, Wrench } from "@/components/ui/appIcons";
import { Fact, Facts, Meta } from "@/components/ui/CardKit";
import { auditLabel } from "@/lib/auditView";
import { AdminPausePlanButton } from "@/components/admin/AdminPausePlanButton";
import { AdminBillDateButton } from "@/components/admin/AdminBillDateButton";
import { AdminPlanProgressButton } from "@/components/admin/AdminPlanProgressButton";
import { AdminWeeklyTimeButton } from "@/components/admin/AdminWeeklyTimeButton";
import { AdminAccountTools } from "@/components/admin/AdminAccountTools";
import { AdminCreditExpiryButton } from "@/components/admin/AdminCreditExpiryButton";
import { AdminCancelAllButton } from "@/components/admin/AdminClassTools";
import { AdminGroupButton, AdminParentLinksButton } from "@/components/admin/AdminGroupTools";
import { AdminPlanSettingsButton, AdminRestartPlanButton } from "@/components/admin/AdminPlanSettingsButton";
import { etDayKey } from "@/lib/fingerPractice";
import { AdminPlanBuilderButton } from "@/components/admin/AdminPlanBuilderButton";
import { AdminPlanSetupButton } from "@/components/admin/AdminPlanSetupButton";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { getServerAuthSession } from "@/lib/auth";
import { isIndefinitePause, isPausedNow } from "@/lib/planPause";
import { describePaymentPlan, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { countUpcomingClasses, getPersonPayments } from "@/lib/payments";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { approvePaymentAction, cancelBillAction, checkPaymentAction, markBillPaidAction, refundPaymentAction, rejectPaymentAction, undoRefundPaymentAction } from "../../payments/actions";
import { AdminCancelPlanButton, AdminRecordPaymentButton, AdminResendBillButton, AdminSettleLateButton } from "@/components/admin/AdminPlanMoneyTools";
import { RemindButton } from "@/components/admin/RemindButton";

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const metadata = { title: "Admin: Student" };

type FactTone = "default" | "muted" | "warning" | "danger";
const FACT_TONE: Record<FactTone, string> = { default: "text-slate-100", muted: "text-slate-400", warning: "text-amber-300", danger: "text-red-400" };

/**
 * A `Fact` (value over its label) with one more quiet line under the label that belongs to it. Badges and buttons under a fact are
 * part of its value, so they sit in a second dd (a bare element inside a dl group is invalid); the grid rows draw value, label, extra.
 */
function FactWithExtra({ label, value, tone, extra, className }: { label: string; value: string; tone: FactTone; extra: ReactNode; className?: string }) {
  return (
    <div className={`grid min-w-0 content-start ${className ?? ""}`}>
      <dt className="row-start-2 mt-0.5 text-caption text-slate-500">{label}</dt>
      <dd className={`row-start-1 truncate text-body font-medium tabular-nums ${FACT_TONE[tone]}`}>{value}</dd>
      <dd className="row-start-3 mt-1 min-w-0">{extra}</dd>
    </div>
  );
}

export default async function AdminCustomerPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const profile = await getCustomerProfile(params.userId);
  if (!profile) notFound();

  // The at-a-glance strip and the change log: the first questions after "who is this?" are plan, credits, next class,
  // Discord, last seen, and what an admin already changed on the account.
  const [plan, discord, changes, lastCanceled, discountRow, scholarship, openBill, paidGroups, personPayments] = await Promise.all([
    prisma.paymentPlan.findFirst({ where: { userId: params.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true, cadence: true, term: true, nextDueDate: true, familyGroupId: true, pausedAt: true, pauseUntil: true, reservedScheduleId: true, installmentAmountCents: true, installmentsPaid: true, termMonths: true, startsAt: true } }),
    prisma.user.findUnique({ where: { id: params.userId }, select: { discordId: true, discordUsername: true, trialEndsAt: true } }),
    // Their plans', payments' and classes' changes too: those are logged against the plan, payment or class, not the person.
    accountAuditWhere(params.userId).then((where) => prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 8 })),
    prisma.paymentPlan.findFirst({ where: { userId: params.userId, status: "CANCELED" }, orderBy: { canceledAt: "desc" }, select: { id: true, cadence: true, term: true } }),
    prisma.accountDiscount.findUnique({ where: { userId: params.userId }, select: { percent: true, note: true } }),
    prisma.scholarshipCode.aggregate({ where: { claimedById: params.userId, claimedAt: { not: null }, revokedAt: null }, _max: { percent: true } }),
    // The money jobs in the Plan menu and the Money section act here, so the person's page never sends anyone to Billing.
    prisma.zellePayment.findFirst({ where: { paymentPlan: { userId: params.userId, status: "ACTIVE" }, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } }, orderBy: { createdAt: "desc" }, select: { id: true, amountCents: true } }),
    prisma.familyPlanGroup.findMany({ where: { payerId: params.userId, plans: { some: { status: "ACTIVE" } } }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true } }),
    getPersonPayments(params.userId),
  ]);
  const scholarshipPercent = scholarship._max.percent ?? 0;
  const nextBooking = profile.bookings.filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > Date.now()).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
  const viewer = await getServerAuthSession();
  const isOwner = isOwnerEmail(viewer?.user?.email);
  const planPaused = plan ? isPausedNow(plan, new Date()) : false;
  // One "Plan" menu replaces a row of seven buttons: the everyday jobs first, the owner's rare tools under "Advanced", and ending
  // the plan or canceling every class last, in red.
  // The buttons stay mounted inside the menu (it only hides), and each one's dialog opens in a portal, so tapping one never loses it.
  const upcomingCount = profile.bookings.filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > Date.now()).length;
  // Every group or parent plan this person pays for, their own plan's group aside (a parent who pays but is not learning has no plan).
  const groupsTheyPay = paidGroups.filter((g) => g.id !== plan?.familyGroupId);
  const hasAdvanced = isOwner && (!!plan || !!lastCanceled || groupsTheyPay.length > 0);
  const firstName = (profile.user.name ?? "student").split(" ")[0];
  const planLate = !!plan && (plan.nextDueDate.getTime() < Date.now() || !!openBill);
  const upcomingByUser = isOwner ? await countUpcomingClasses([params.userId, ...personPayments.map((p) => p.user.id)]) : {};
  const planMenu =
    plan || isOwner || nextBooking ? (
      <ActionMenu key="plan-menu" label="Plan" openEvent="bnp-open-plan-menu" icon={<Wrench aria-hidden className="mr-1.5 h-4 w-4" />}>
        {/* The everyday way to put someone on a plan or move its start: weekly time, first class and scholarship in one step. */}
        {isOwner && <AdminPlanSetupButton userId={params.userId} compact />}
        {/* Group and parent plans too: each person on one has their own plan, paused, moved and rebuilt on its own. */}
        {plan && <AdminPausePlanButton planId={plan.id} state={{ paused: planPaused, until: plan.pauseUntil && !isIndefinitePause(plan) ? plan.pauseUntil.toISOString() : null }} compact />}
        {plan && !planPaused && <AdminWeeklyTimeButton planId={plan.id} compact />}
        {plan && openBill && <AdminResendBillButton planId={plan.id} compact />}
        {hasAdvanced && <ActionMenuLabel>Advanced (owner)</ActionMenuLabel>}
        {/* Each person's bill has its own date, group and parent plans included, so the owner can move any running one. */}
        {plan && isOwner && !planPaused && <AdminBillDateButton planId={plan.id} currentDay={etDayKey(plan.nextDueDate)} compact />}
        {plan && isOwner && <AdminPlanProgressButton planId={plan.id} billsPaid={plan.installmentsPaid} termMonths={plan.termMonths} currentDay={etDayKey(plan.nextDueDate)} compact />}
        {plan && isOwner && !planPaused && (
          <AdminPlanSettingsButton
            planId={plan.id}
            term={plan.term}
            priceCents={plan.installmentAmountCents}
            installmentsPaid={plan.installmentsPaid}
            hasDiscount={(discountRow?.percent ?? 0) > 0}
            userId={params.userId}
            discountPercent={discountRow?.percent ?? 0}
            discountNote={discountRow?.note ?? null}
            groupPlan={!!plan.familyGroupId}
            compact
          />
        )}
        {plan && isOwner && <AdminRecordPaymentButton planId={plan.id} amountCents={openBill?.amountCents ?? plan.installmentAmountCents} firstPayment={plan.installmentsPaid === 0} openBill={!!openBill} compact />}
        {plan && isOwner && !planPaused && planLate && <AdminSettleLateButton planId={plan.id} compact />}
        {plan?.familyGroupId && isOwner && <AdminGroupButton groupId={plan.familyGroupId} planId={plan.id} userId={params.userId} />}
        {isOwner &&
          groupsTheyPay.map((g) => (
            <AdminGroupButton key={g.id} groupId={g.id} planId={null} userId={params.userId} label={g.kind === "PARENT" ? "Parent plan they pay for" : "Group they pay for"} />
          ))}
        {!plan && isOwner && lastCanceled && <AdminRestartPlanButton planId={lastCanceled.id} label={describePaymentPlan(lastCanceled.cadence, lastCanceled.term)} compact />}
        {isOwner && <AdminPlanBuilderButton userId={params.userId} />}
        {/* Destructive, so last and in red, under their own label (DESIGN.md, Hierarchy rule 6); each dialog still asks first. */}
        <ActionMenuLabel>Danger</ActionMenuLabel>
        {plan && isOwner && <AdminCancelPlanButton planId={plan.id} label={describePaymentPlan(plan.cadence, plan.term)} compact />}
        <AdminCancelAllButton userId={params.userId} firstName={firstName} upcoming={upcomingCount} />
      </ActionMenu>
    ) : null;
  // Value first, label under it (DESIGN.md, Hierarchy rule 3); a problem carries colour (a late bill red, no Discord amber), an empty one is muted.
  // `extra` is a quiet line under a fact that belongs to it: the plan's scholarship, discount and later start, Discord's Remind.
  const billLate = !!plan && plan.nextDueDate.getTime() < Date.now();
  const discountPercent = discountRow?.percent ?? 0;
  const startsLater = !!plan?.startsAt && plan.startsAt.getTime() > Date.now();
  const planExtras = plan
    ? [
        scholarshipPercent > 0 && plan.term === "TERM_6" ? `Scholarship ${scholarshipPercent}%` : null,
        discountPercent > 0 ? `Discount ${discountPercent}%` : null,
        // Not started yet is news, so it keeps the accent.
        startsLater && plan.startsAt ? <span className="text-signal-fg">Starts {when(plan.startsAt).replace(/, \d+:\d+ [AP]M$/, "")}</span> : null,
      ]
    : [];
  const facts: { label: string; value: string; tone: FactTone; wide?: boolean; extra?: ReactNode }[] = [
    {
      label: "Plan",
      value: plan ? describePaymentPlan(plan.cadence, plan.term) : "None",
      tone: plan ? "default" : "muted",
      wide: true,
      extra: planExtras.some(Boolean) ? <Meta items={planExtras} /> : undefined,
    },
    {
      label: billLate ? "Bill was due" : "Next bill",
      value: plan && planPaused && isIndefinitePause(plan) ? "Paused" : plan ? when(plan.nextDueDate).replace(/, \d+:\d+ [AP]M$/, "") : "None",
      tone: billLate ? "danger" : plan ? "default" : "muted",
    },
    { label: "Credits", value: formatCredits(storedToCredits(profile.user.classCredits)), tone: profile.user.classCredits > 0 ? "default" : "muted" },
    { label: "Next class", value: nextBooking ? when(nextBooking.scheduledAt) : "None booked", tone: nextBooking ? "default" : "muted" },
    {
      label: "Discord",
      value: discord?.discordId ? (discord.discordUsername ?? "Linked") : "Not linked",
      tone: discord?.discordId ? "default" : "warning",
      // The fixed "connect Discord to join your class" reminder, right where the gap shows (it needs a running plan).
      extra: !discord?.discordId && plan ? <RemindButton kind="discord" userId={params.userId} name={firstName} /> : undefined,
    },
    { label: "Streak", value: `${profile.user.currentStreak} ${profile.user.currentStreak === 1 ? "day" : "days"}`, tone: profile.user.currentStreak > 0 ? "default" : "muted" },
    { label: "Last active", value: profile.user.lastActivityAt ? when(profile.user.lastActivityAt) : "Not seen yet", tone: profile.user.lastActivityAt ? "default" : "muted" },
  ];

  return (
    <div>
      {/* Only the admin menu pins; a student's name and Back scroll with their page. */}
      <div>
        <PageBack href="/admin/users" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 data-page-title="" className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">{profile.user.name ?? profile.user.email}</h1>
      </div>

      <Facts className="mt-5 rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
        {facts.map((f) =>
          f.extra ? (
            <FactWithExtra key={f.label} label={f.label} value={f.value} tone={f.tone} extra={f.extra} className={f.wide ? "col-span-2" : undefined} />
          ) : (
            <Fact key={f.label} label={f.label} value={f.value} tone={f.tone} className={f.wide ? "col-span-2" : undefined} />
          ),
        )}
      </Facts>

      <div className="mt-6">
        <CustomerProfile
          profile={profile}
          planMenu={planMenu}
          creditTools={isOwner ? <AdminCreditExpiryButton key="credit-tools" userId={params.userId} /> : null}
          canEditPayments={isOwner}
          paymentsPanel={
            <PaymentQueue
              key="payments"
              personView
              payments={personPayments}
              onApprove={approvePaymentAction}
              onReject={rejectPaymentAction}
              onCheck={checkPaymentAction}
              onRefund={isOwner ? refundPaymentAction : undefined}
              onUndoRefund={isOwner ? undoRefundPaymentAction : undefined}
              onCancelBill={isOwner ? cancelBillAction : undefined}
              onMarkPaid={isOwner ? markBillPaidAction : undefined}
              canFix={isOwner}
              upcomingClasses={upcomingByUser}
              emptyMessage="No payments yet."
            />
          }
          accountTools={
            isOwner ? (
              [<AdminAccountTools key="account-tools" userId={params.userId} name={profile.user.name ?? ""} email={profile.user.email} phone={profile.user.phone ?? ""} trialEndsAt={discord?.trialEndsAt && discord.trialEndsAt > new Date() ? discord.trialEndsAt.toISOString() : null} />, <AdminParentLinksButton key="parent-links" userId={params.userId} />]
            ) : null
          }
          scheduler={
            <StudentScheduler
              key="scheduler"
              studentId={params.userId}
              studentName={profile.user.name ?? profile.user.email}
              bookings={profile.bookings.map((b) => ({ id: b.id, label: b.schedule.label, scheduledAt: b.scheduledAt.toISOString(), creditsSpent: b.creditsSpent, status: b.status, attendance: b.attendance, inPerson: b.inPerson }))}
              loadOpenSlots={getOpenSlotsAction}
              onMove={adminMoveBookingAction}
              onMoveToTime={adminMoveBookingToTimeAction}
              onCancel={adminCancelBookingAction}
              onBook={adminBookClassAction}
              onMark={markAttendanceAction}
              onUndo={undoAttendanceAction}
              onSetInPerson={setClassInPersonAction}
            />
          }
          changeLog={
            changes.length > 0 ? (
              <section key="change-log" className="glass-surface p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-caption font-medium uppercase tracking-caps text-slate-500">Changes made on this account</h2>
                  <Link href={`/admin/activity?user=${params.userId}&days=all`} className="tap inline-flex shrink-0 items-center gap-1 rounded-sm text-small font-medium text-slate-400 hover:text-slate-200">
                    See all
                    <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <ul className="mt-3 divide-y divide-slate-50/6">
                  {changes.map((c) => (
                    <li key={c.id} className="py-2.5">
                      <p className="text-small font-medium text-slate-100">{auditLabel(c.action)}</p>
                      <Meta className="mt-0.5" items={[c.detail, c.actorEmail ?? "System", when(c.createdAt)]} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null
          }
          onSetCurriculumAccess={setCurriculumAccessAction}
          onToggleScale={toggleScaleUnlockAction}
          onClearAssistantHistory={clearAssistantHistoryAction}
          onSetRole={setUserRoleAction}
          onAdjustCredits={adjustUserCreditsAction}
          onForceSignOut={adminForceSignOutAction}
          onForgetPayerName={forgetPayerNameAction}
          onClearPhone={adminClearPhoneAction}
          onBan={banUserAction}
          onUnban={unbanUserAction}
          onLiftPaymentLock={liftPaymentLockAction}
        />
      </div>

    </div>
  );
}
