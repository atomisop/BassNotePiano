import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { ProfileMenu } from "./ProfileMenu";

/**
 * The dock's round island: the signed-in person's own picture. Tapping it opens their menu upward (the dock is at the bottom).
 * A server component for the same reason TopBar's old avatar was: the picture is kept out of the session cookie and read from the DB here.
 */
export async function DockProfile({ isAdmin }: { isAdmin: boolean }) {
  const session = await getServerAuthSession();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, username: true, image: true } });
  if (!user) return null;
  return (
    <ProfileMenu
      name={user.name}
      username={user.username}
      email={session.user.email ?? null}
      image={user.image}
      isOwner={isOwnerEmail(session.user.email)}
      appExtras={{ isAdmin }}
      placement="up"
    />
  );
}
