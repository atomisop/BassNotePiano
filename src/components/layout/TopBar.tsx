import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { AdminAttendanceQuickPanel } from "@/components/admin/AdminAttendanceQuickPanel";
import { ProfileMenu } from "./ProfileMenu";
import { AdminTopLink } from "./AdminTopLink";
import { LiveClassesTopLink } from "./LiveClassesTopLink";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { BrandMark } from "./BrandMark";
import { AskAiButton } from "./AskAiButton";

/**
 * The user's real photo, fetched here rather than read off the session,
 * `image` is deliberately excluded from the JWT (see `auth.ts`'s
 * `loadEntitlements` comment: it can be a multi-KB base64 data URI, and
 * that's too large for a session cookie). Same "fetch it directly from the
 * DB" convention `/profile` already uses, not a new pattern.
 *
 * Just the data fetch, ProfileMenu (client) owns the actual dropdown, since
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

  return (
    <ProfileMenu
      name={user.name}
      username={user.username}
      email={session.user.email ?? null}
      image={user.image}
      isOwner={isOwnerEmail(session.user.email)}
    />
  );
}

export function TopBar({ isAdmin, isOwner }: { isAdmin: boolean; isOwner: boolean }) {
  // fixed, not in-flow: this used to be a plain flex child (relative z-30)
  // that never scrolled away purely because it sat outside `<main>`'s own
  // scroll area in `(dashboard)/layout.tsx`, structurally sound, but a
  // visitor reported it disappearing anyway on the way back from "on-screen
  // stuff" (a full-bleed view, lesson video, a nav overlay, that never
  // fully released whatever was covering it). Rather than chase that one
  // specific culprit, it's fixed to the true viewport top now, by direct
  // instruction ("making it permanent... gives freedom to navigate to the
  // homepage from any screen"), nothing can leave it stuck hidden again,
  // since it no longer depends on any other component correctly restoring
  // its own state to reveal it.
  //
  // z-[45]: above AppDock/Atom/every other floating-chrome overlay in the
  // app (all z-40 or below), so a repeat of the same class of bug can't
  // cover it again, but still below every real modal dialog (WhatsNewModal,
  // the Zelle/Quiz/ProOverride progression modals, MoreSheet, CommandMenu,
  // all z-50; OnboardingTour's own full-tour overlay higher still at
  // z-[60]), which stay genuinely blocking: a payment or quiz in progress
  // shouldn't be navigable away from via a topbar floating on top of its
  // own scrim.
  //
  // `(dashboard)/layout.tsx` adds `pt-16` to this header's old flex parent
  // to reserve the 64px this now paints over instead of occupying in flow.
  return (
    <header className="fixed inset-x-0 top-0 z-[45] flex h-16 items-center justify-between bg-neu-base px-4 shadow-raised-mid md:px-8">
      <BrandMark />
      <div className="flex items-center gap-2 md:gap-3">
        {/* Leftmost of the right-hand cluster: Ask AI, admin, attendance, bell, profile. */}
        <AskAiButton />
        {/* Moved here from AppDock's own row of icons, by direct
            instruction, it was the one dock item that wasn't an everyday
            destination for every signed-in visitor (just the single admin
            account), so it reads better as a utility icon next to
            notifications than as a sixth, role-gated tab sitting among
            Home/Lessons/Friends/Messages/Settings. Same `h-9 w-9 rounded-lg`
            treatment as the bell right next to it, so the two read as one
            matched pair of icon buttons rather than two different styles. */}
        {/* Buttons sit in one pressed-in tray so they read as raised keys set into the bar. */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-neu-base p-1 shadow-pressed-low">
        {isAdmin ? <AdminTopLink /> : <LiveClassesTopLink />}
        {/* Owner only. Quick Present/No-show from anywhere, by direct instruction, the
            full roster at Schedule → Attendance still exists for
            history/cancellation, this is just the fast path for the one
            everyday action (mark today's classes) without a full admin-page
            navigation first. */}
        {isOwner && <AdminAttendanceQuickPanel />}
        <NotificationBell />
        <ProfileAvatarLink />
        </div>
      </div>
    </header>
  );
}
