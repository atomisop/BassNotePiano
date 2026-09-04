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
  // relative z-30: .chrome's own backdrop-filter already makes this header
  // a separate stacking context from its siblings below (AnnouncementBanner,
  // main), but with no z-index of its own that context has no priority
  // over them, it just paints in plain DOM order, first. AnnouncementBanner
  // wins that order once it's on screen (Framer Motion's transform gives its
  // own div a stacking context too), covering the top of ProfileMenu's open
  // dropdown even though the dropdown itself is z-50: that z-50 only ever
  // competes with things inside this same header, never with a sibling
  // entirely outside it. An explicit z-index here is scoped to this header
  // vs. its own siblings only, so it can't reach past them to outrank
  // AppDock or any modal one level further up the tree.
  return (
    <header className="chrome relative z-30 flex h-16 shrink-0 items-center justify-between border-b border-ink/10 px-8">
      <BrandMark />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <ProfileAvatarLink />
      </div>
    </header>
  );
}
