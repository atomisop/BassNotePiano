import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActivePaymentPlan } from "@/lib/paymentPlans";
import { loadPersistedHistory } from "@/lib/assistant";
import { AccountSettings } from "./AccountSettings";

export default async function AccountPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/account");

  const [user, assistantHistory, activePlan] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
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
