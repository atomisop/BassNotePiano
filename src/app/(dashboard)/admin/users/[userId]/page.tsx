import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/lib/adminCustomer";
import { CustomerProfile } from "@/components/admin/CustomerProfile";
import { setCurriculumAccessAction, toggleScaleUnlockAction, clearAssistantHistoryAction, setUserRoleAction } from "../actions";
import { adjustUserCreditsAction } from "../../payments/credit-actions";
import { adminCancelBookingAction } from "../../schedule/actions";
import { adminClearPhoneAction, adminForceSignOutAction, banUserAction, forgetPayerNameAction, unbanUserAction } from "./actions";
import { BackLink } from "@/components/ui/BackLink";
import { prisma } from "@/lib/prisma";
import { describePaymentPlan, formatCredits, storedToCredits } from "@/lib/classCreditPricing";

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const metadata = { title: "Admin: Student" };

export default async function AdminCustomerPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const profile = await getCustomerProfile(params.userId);
  if (!profile) notFound();

  // The at-a-glance strip and the change log: the first questions after "who is this?" are plan, credits, next class,
  // Discord, last seen, and what an admin already changed on the account.
  const [plan, discord, changes] = await Promise.all([
    prisma.paymentPlan.findFirst({ where: { userId: params.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { cadence: true, term: true, nextDueDate: true } }),
    prisma.user.findUnique({ where: { id: params.userId }, select: { discordId: true, discordUsername: true } }),
    prisma.auditLog.findMany({ where: { targetId: params.userId }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const nextBooking = profile.bookings.filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > Date.now()).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
  const facts: { label: string; value: string; warn?: boolean }[] = [
    { label: "Plan", value: plan ? describePaymentPlan(plan.cadence, plan.term) : "None" },
    { label: "Next bill", value: plan ? when(plan.nextDueDate).replace(/, \d+:\d+ [AP]M$/, "") : "None", warn: !!plan && plan.nextDueDate.getTime() < Date.now() },
    { label: "Credits", value: formatCredits(storedToCredits(profile.user.classCredits)) },
    { label: "Next class", value: nextBooking ? when(nextBooking.scheduledAt) : "None booked" },
    { label: "Discord", value: discord?.discordId ? (discord.discordUsername ?? "Linked") : "Not linked", warn: !discord?.discordId },
    { label: "Streak", value: `${profile.user.currentStreak} days` },
    { label: "Last active", value: profile.user.lastActivityAt ? when(profile.user.lastActivityAt) : "Never" },
  ];

  return (
    <div>
      <BackLink href="/admin/users" className="tap inline-flex items-center text-small font-medium text-slate-500 transition hover:text-slate-300">
        ← Back
      </BackLink>
      <p className="mt-3 text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">{profile.user.name ?? profile.user.email}</h1>

      <dl className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-neu-base p-3 shadow-raised-low sm:grid-cols-4 lg:grid-cols-7">
        {facts.map((f) => (
          <div key={f.label} className="px-2 py-1">
            <dt className="text-small text-slate-500">{f.label}</dt>
            <dd className={`text-small font-semibold ${f.warn ? "text-amber-300" : "text-slate-50"}`}>{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <CustomerProfile
          profile={profile}
          onSetCurriculumAccess={setCurriculumAccessAction}
          onToggleScale={toggleScaleUnlockAction}
          onClearAssistantHistory={clearAssistantHistoryAction}
          onSetRole={setUserRoleAction}
          onAdjustCredits={adjustUserCreditsAction}
          onCancelBooking={adminCancelBookingAction}
          onForceSignOut={adminForceSignOutAction}
          onForgetPayerName={forgetPayerNameAction}
          onClearPhone={adminClearPhoneAction}
          onBan={banUserAction}
          onUnban={unbanUserAction}
        />
      </div>

      {changes.length > 0 && (
        <section className="glass-surface mt-5 p-5">
          <h2 className="text-body font-semibold text-slate-50">Changes made on this account</h2>
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
      )}
    </div>
  );
}
