import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/lib/adminCustomer";
import { CustomerProfile } from "@/components/admin/CustomerProfile";
import { setCurriculumAccessAction, toggleScaleUnlockAction, clearAssistantHistoryAction, setUserRoleAction } from "../actions";
import { adjustUserCreditsAction } from "../../payments/credit-actions";
import { adminCancelBookingAction, adminMoveBookingAction, adminMoveBookingToTimeAction, adminBookClassAction, getOpenSlotsAction, markAttendanceAction, undoAttendanceAction, setClassInPersonAction } from "../../schedule/actions";
import { StudentScheduler } from "@/components/admin/StudentScheduler";
import { adminClearPhoneAction, adminForceSignOutAction, banUserAction, forgetPayerNameAction, unbanUserAction } from "./actions";
import { BackLink, PageBack } from "@/components/ui/BackLink";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import { AdminPausePlanButton } from "@/components/admin/AdminPausePlanButton";
import { AdminBillDateButton } from "@/components/admin/AdminBillDateButton";
import { AdminWeeklyTimeButton } from "@/components/admin/AdminWeeklyTimeButton";
import { AdminAccountTools } from "@/components/admin/AdminAccountTools";
import { AdminCreditExpiryButton } from "@/components/admin/AdminCreditExpiryButton";
import { AdminCancelAllButton } from "@/components/admin/AdminClassTools";
import { AdminPlanSettingsButton, AdminRestartPlanButton } from "@/components/admin/AdminPlanSettingsButton";
import { etDayKey } from "@/lib/fingerPractice";
import { AdminPlanBuilderButton } from "@/components/admin/AdminPlanBuilderButton";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { getServerAuthSession } from "@/lib/auth";
import { isIndefinitePause, isPausedNow } from "@/lib/planPause";
import { describePaymentPlan, formatCredits, storedToCredits } from "@/lib/classCreditPricing";

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const metadata = { title: "Admin: Student" };

export default async function AdminCustomerPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const profile = await getCustomerProfile(params.userId);
  if (!profile) notFound();

  // The at-a-glance strip and the change log: the first questions after "who is this?" are plan, credits, next class,
  // Discord, last seen, and what an admin already changed on the account.
  const [plan, discord, changes, lastCanceled, discountRow] = await Promise.all([
    prisma.paymentPlan.findFirst({ where: { userId: params.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true, cadence: true, term: true, nextDueDate: true, familyGroupId: true, pausedAt: true, pauseUntil: true, reservedScheduleId: true, installmentAmountCents: true, installmentsPaid: true } }),
    prisma.user.findUnique({ where: { id: params.userId }, select: { discordId: true, discordUsername: true, trialEndsAt: true } }),
    prisma.auditLog.findMany({ where: { targetId: params.userId }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.paymentPlan.findFirst({ where: { userId: params.userId, status: "CANCELED" }, orderBy: { canceledAt: "desc" }, select: { id: true, cadence: true, term: true } }),
    prisma.accountDiscount.findUnique({ where: { userId: params.userId }, select: { percent: true } }),
  ]);
  const nextBooking = profile.bookings.filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > Date.now()).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
  const viewer = await getServerAuthSession();
  const isOwner = isOwnerEmail(viewer?.user?.email);
  const planPaused = plan ? isPausedNow(plan, new Date()) : false;
  const planControls =
    plan || isOwner || nextBooking ? (
      <>
        {/* Group and parent plans too: each person on one has their own plan, paused, moved and rebuilt on its own. */}
        {plan && (
          <AdminPausePlanButton planId={plan.id} state={{ paused: planPaused, until: plan.pauseUntil && !isIndefinitePause(plan) ? plan.pauseUntil.toISOString() : null }} compact />
        )}
        {plan && !planPaused && <AdminWeeklyTimeButton planId={plan.id} compact />}
        {/* Each person's bill has its own date, group and parent plans included, so the owner can move any running one. */}
        {plan && isOwner && !planPaused && <AdminBillDateButton planId={plan.id} currentDay={etDayKey(plan.nextDueDate)} compact />}
        {plan && isOwner && !planPaused && (
          <AdminPlanSettingsButton planId={plan.id} term={plan.term} priceCents={plan.installmentAmountCents} installmentsPaid={plan.installmentsPaid} hasDiscount={(discountRow?.percent ?? 0) > 0} compact />
        )}
        {!plan && isOwner && lastCanceled && <AdminRestartPlanButton planId={lastCanceled.id} label={describePaymentPlan(lastCanceled.cadence, lastCanceled.term)} compact />}
        {isOwner && <AdminPlanBuilderButton userId={params.userId} />}
        <AdminCancelAllButton userId={params.userId} firstName={(profile.user.name ?? "student").split(" ")[0]} upcoming={profile.bookings.filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > Date.now()).length} />
      </>
    ) : null;
  const facts: { label: string; value: string; warn?: boolean; extra?: ReactNode }[] = [
    {
      label: "Plan",
      value: plan ? describePaymentPlan(plan.cadence, plan.term) : "None",
    },
    { label: "Next bill", value: plan && planPaused && isIndefinitePause(plan) ? "Paused" : plan ? when(plan.nextDueDate).replace(/, \d+:\d+ [AP]M$/, "") : "None", warn: !!plan && plan.nextDueDate.getTime() < Date.now() },
    { label: "Credits", value: formatCredits(storedToCredits(profile.user.classCredits)) },
    { label: "Next class", value: nextBooking ? when(nextBooking.scheduledAt) : "None booked" },
    { label: "Discord", value: discord?.discordId ? (discord.discordUsername ?? "Linked") : "Not linked", warn: !discord?.discordId },
    { label: "Streak", value: `${profile.user.currentStreak} days` },
    { label: "Last active", value: profile.user.lastActivityAt ? when(profile.user.lastActivityAt) : "Never" },
  ];

  return (
    <div>
      {/* Only the admin menu pins; a student's name and Back scroll with their page. */}
      <div>
        <PageBack href="/admin/users" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">{profile.user.name ?? profile.user.email}</h1>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-neu-base p-3 shadow-raised-low sm:grid-cols-4 lg:grid-cols-7">
        {facts.map((f) => (
          <div key={f.label} className="px-2 py-1">
            <dt className="text-small text-slate-500">{f.label}</dt>
            <dd className={`text-small font-semibold ${f.warn ? "text-amber-300" : "text-slate-50"}`}>{f.value}</dd>
            {f.extra}
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <CustomerProfile
          profile={profile}
          creditTools={isOwner ? <AdminCreditExpiryButton key="credit-tools" userId={params.userId} /> : null}
          accountTools={
            isOwner ? (
              <AdminAccountTools key="account-tools" userId={params.userId} name={profile.user.name ?? ""} email={profile.user.email} phone={profile.user.phone ?? ""} trialEndsAt={discord?.trialEndsAt && discord.trialEndsAt > new Date() ? discord.trialEndsAt.toISOString() : null} />
            ) : null
          }
          scheduler={
            <StudentScheduler
              studentId={params.userId}
              studentName={profile.user.name ?? profile.user.email}
              bookings={profile.bookings.map((b) => ({ id: b.id, label: b.schedule.label, scheduledAt: b.scheduledAt.toISOString(), creditsSpent: b.creditsSpent, status: b.status, attendance: b.attendance, inPerson: b.inPerson }))}
              loadOpenSlots={getOpenSlotsAction}
              planControls={planControls}
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
              <section className="glass-surface p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-title font-semibold text-slate-50">Changes made on this account</h2>
                  <Link href={`/admin/activity?user=${params.userId}&days=all`} className="text-small text-slate-400 underline underline-offset-4 hover:text-slate-200">See all</Link>
                </div>
                <ul className="mt-3 divide-y divide-slate-50/10">
                  {changes.map((c) => (
                    <li key={c.id} className="py-2.5 text-small">
                      <p className="text-slate-200">
                        <span className="font-medium">{c.action}</span>
                        {c.detail ? <span className="text-slate-400"> · {c.detail}</span> : null}
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        {c.actorEmail ?? "System"} · {when(c.createdAt)}
                      </p>
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
        />
      </div>

    </div>
  );
}
