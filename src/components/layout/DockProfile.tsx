import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { ProfileMenu } from "./ProfileMenu";

/**
 * The signed-in person's own picture and menu. In the top bar the menu opens downward; the "up" placement is for a spot at the bottom of the screen.
 * A server component for the same reason TopBar's old avatar was: the picture is kept out of the session cookie and read from the DB here.
 */
export async function DockProfile({ isAdmin, placement = "up" }: { isAdmin: boolean; placement?: "up" | "down" }) {
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
      placement={placement}
    />
  );
}
