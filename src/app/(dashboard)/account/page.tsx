import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClassCreditBalance } from "@/lib/classSchedule";
import { loadPersistedHistory } from "@/lib/assistant";
import { AccountSettings } from "./AccountSettings";

export default async function AccountPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/account");

  const [user, credits, assistantHistory] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        notifyEmailPayments: true,
        notifyEmailRoleUpdates: true,
        notifyEmailSocial: true,
        notifyEmailReminders: true,
      },
    }),
    getClassCreditBalance(session.user.id),
    loadPersistedHistory(session.user.id),
  ]);
  if (!user) redirect("/login");

  return (
    <AccountSettings
      hasCurriculumAccess={session.user.hasCurriculumAccess}
      classCredits={credits}
      initialNotificationPreferences={{
        notifyEmailPayments: user.notifyEmailPayments,
        notifyEmailRoleUpdates: user.notifyEmailRoleUpdates,
        notifyEmailSocial: user.notifyEmailSocial,
        notifyEmailReminders: user.notifyEmailReminders,
      }}
      assistantHistory={assistantHistory}
    />
  );
}
