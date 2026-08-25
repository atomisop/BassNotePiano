import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ProfileMenu } from "./ProfileMenu";
import { BrandMark } from "./BrandMark";

/**
 * The user's real photo, fetched here rather than read off the session —
 * `image` is deliberately excluded from the JWT (see `auth.ts`'s
 * `loadEntitlements` comment: it can be a multi-KB base64 data URI, and
 * that's too large for a session cookie). Same "fetch it directly from the
 * DB" convention `/profile` already uses, not a new pattern.
 *
 * Just the data fetch — ProfileMenu (client) owns the actual dropdown, since
 * open/close state and outside-click handling can't live in a Server
 * Component.
 */
async function ProfileAvatarLink() {
  const session = await getServerAuthSession();
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, username: true, image: true },
  });
  if (!user) return null;

  return <ProfileMenu name={user.name} username={user.username} email={session.user.email ?? null} image={user.image} />;
}

export function TopBar() {
  return (
    <header className="chrome flex h-16 shrink-0 items-center justify-between border-b border-ink/10 px-8">
      <BrandMark />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <ProfileAvatarLink />
      </div>
    </header>
  );
}
