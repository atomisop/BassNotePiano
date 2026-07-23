import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccountSettings } from "./AccountSettings";

export default async function AccountPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/account");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      username: true,
      primaryInstrument: true,
      skillLevel: true,
      genres: true,
      learningGoal: true,
      notifyEmailPayments: true,
      notifyEmailRoleUpdates: true,
      notifyEmailSocial: true,
      notifyEmailReminders: true,
    },
  });
  if (!user) redirect("/login");

  return (
    <AccountSettings
      email={user.email}
      initialName={user.name}
      initialImage={user.image}
      initialUsername={user.username}
      initialMusicProfile={{
        primaryInstrument: user.primaryInstrument,
        skillLevel: user.skillLevel,
        genres: user.genres,
        learningGoal: user.learningGoal,
      }}
      isProMember={session.user.isProMember}
      initialNotificationPreferences={{
        notifyEmailPayments: user.notifyEmailPayments,
        notifyEmailRoleUpdates: user.notifyEmailRoleUpdates,
        notifyEmailSocial: user.notifyEmailSocial,
        notifyEmailReminders: user.notifyEmailReminders,
      }}
    />
  );
}
