import { isIndefinitePause } from "@/lib/planPause";
import { discordLinkState } from "@/lib/discordLinkState";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActivePaymentPlan, getFamilyDetails } from "@/lib/paymentPlans";
import { loadPersistedHistory } from "@/lib/assistant";
import { phoneVerifyMode } from "@/lib/phoneVerification";
import { unusedBackupCodeCount } from "@/lib/adminTwoStep";
import { AccountSettings } from "./AccountSettings";

export const metadata = { title: "Settings" };

export default async function AccountPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/account");

  const [user, assistantHistory, activePlan] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        username: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        phone: true,
        phoneVerifiedAt: true,
        pendingPhone: true,
        phoneRequired: true,
        discordId: true,
        discordUsername: true,
        notifyEmailPayments: true,
        notifyEmailRoleUpdates: true,
        notifyEmailSocial: true,
        notifyEmailReminders: true,
        notifyEmailClasses: true,
        role: true,
        totpEnabledAt: true,
      },
    }),
    loadPersistedHistory(session.user.id),
    getActivePaymentPlan(session.user.id),
  ]);
  if (!user) redirect("/login");
  const familyDetails = await getFamilyDetails(session.user.id, activePlan);

  return (
    <AccountSettings
      account={{
        name: user.name,
        username: user.username,
        email: user.email,
        emailVerified: Boolean(user.emailVerified),
        createdAt: user.createdAt.toISOString(),
        phone: {
          phone: user.phone,
          verified: Boolean(user.phone && user.phoneVerifiedAt),
          pendingPhone: user.pendingPhone,
          required: user.phoneRequired,
          verifyMode: await phoneVerifyMode(),
        },
        discordUsername: discordLinkState({ discordId: user.discordId, discordUsername: user.discordUsername }).name,
      }}
      hasCurriculumAccess={session.user.hasCurriculumAccess}
      twoStep={user.role === "ADMIN" ? { enabled: Boolean(user.totpEnabledAt), backupLeft: user.totpEnabledAt ? await unusedBackupCodeCount(session.user.id) : 0 } : null}
      initialNotificationPreferences={{
        notifyEmailPayments: user.notifyEmailPayments,
        notifyEmailRoleUpdates: user.notifyEmailRoleUpdates,
        notifyEmailSocial: user.notifyEmailSocial,
        notifyEmailReminders: user.notifyEmailReminders,
        notifyEmailClasses: user.notifyEmailClasses,
      }}
      assistantHistory={assistantHistory}
      activePlan={
        activePlan
          ? {
              cadence: activePlan.cadence,
              term: activePlan.term,
              installmentsPaid: activePlan.installmentsPaid,
              termMonths: activePlan.termMonths,
              installmentAmountCents: activePlan.installmentAmountCents,
              nextDueDate: isIndefinitePause(activePlan) && activePlan.pauseUntil && activePlan.pauseUntil > new Date() ? null : activePlan.nextDueDate.toISOString(),
              pausedIndefinitely: isIndefinitePause(activePlan) && Boolean(activePlan.pauseUntil && activePlan.pauseUntil > new Date()),
              family: familyDetails,
              pausedAt: activePlan.pausedAt?.toISOString() ?? null,
              pausedUntil: activePlan.pauseUntil && activePlan.pauseUntil > new Date() && !isIndefinitePause(activePlan) ? activePlan.pauseUntil.toISOString() : null,
            }
          : null
      }
    />
  );
}
