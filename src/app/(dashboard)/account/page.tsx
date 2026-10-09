import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActivePaymentPlan } from "@/lib/paymentPlans";
import { loadPersistedHistory } from "@/lib/assistant";
import { smsAvailable } from "@/lib/sms";
import { AccountSettings } from "./AccountSettings";

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
        discordUsername: true,
        notifyEmailPayments: true,
        notifyEmailRoleUpdates: true,
        notifyEmailSocial: true,
        notifyEmailReminders: true,
      },
    }),
    loadPersistedHistory(session.user.id),
    getActivePaymentPlan(session.user.id),
  ]);
  if (!user) redirect("/login");

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
          smsAvailable: smsAvailable(),
        },
        discordUsername: user.discordUsername,
      }}
      hasCurriculumAccess={session.user.hasCurriculumAccess}
      initialNotificationPreferences={{
        notifyEmailPayments: user.notifyEmailPayments,
        notifyEmailRoleUpdates: user.notifyEmailRoleUpdates,
        notifyEmailSocial: user.notifyEmailSocial,
        notifyEmailReminders: user.notifyEmailReminders,
      }}
      assistantHistory={assistantHistory}
      activePlan={
        activePlan
          ? {
              cadence: activePlan.cadence,
              term: activePlan.term,
              installmentsPaid: activePlan.installmentsPaid,
              termMonths: activePlan.termMonths,
            }
          : null
      }
    />
  );
}
