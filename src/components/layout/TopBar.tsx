import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StudentNotesPanel } from "@/components/admin/StudentNotesPanel";
import { AdminAttendanceQuickPanel } from "@/components/admin/AdminAttendanceQuickPanel";
import { ProfileMenu } from "./ProfileMenu";
import { AdminTopLink } from "./AdminTopLink";
import { Breadcrumb } from "./Breadcrumb";
import { FriendsTopLink } from "./FriendsTopLink";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { AskAiButton } from "./AskAiButton";
import { TopBarTools } from "./TopBarTools";
import { AdminAlertsButton } from "./AdminAlertsButton";
import type { SidebarCard } from "@/lib/sidebarCards";
import { CreditsBadge } from "./CreditsBadge";
import { StreakBadge } from "./StreakBadge";
import { BrandMark } from "./BrandMark";
import { SidebarToggle } from "./SidebarToggle";

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
async function ProfileAvatarLink({ isAdmin }: { isAdmin: boolean }) {
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
      appExtras={{ isAdmin }}
    />
  );
}

export function TopBar({ isAdmin, isOwner, alertCards = [] }: { isAdmin: boolean; isOwner: boolean; alertCards?: SidebarCard[] }) {
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
    <header className="pad-safe-x pointer-events-none fixed inset-x-0 top-0 z-[45] px-2 pt-[max(0.375rem,env(safe-area-inset-top))] md:px-3">
      {/* No bar at all: the logo and each button float on their own over the page, which scrolls under them (kept below the notch and
          Dynamic Island on phones). Every button carries its own surface, so it stays readable over whatever passes underneath. */}
      <div data-glass="" className="pointer-events-auto relative flex h-12 w-full items-center justify-between gap-2 rounded-full px-1.5 min-[360px]:gap-3 min-[360px]:px-2 md:mx-auto md:w-fit md:max-w-full md:justify-start md:gap-5 md:px-3">
      {/* No bar and no logo: only the controls float. The header ignores the mouse so it never blocks the page; its two groups take it back. */}
      <div className="relative z-10 flex items-center gap-2">
        {/* The logo is shown on phones only; from md up the sidebar and toggle take its place. */}
        <div className="md:hidden">
          <BrandMark />
        </div>
        <SidebarToggle />
        <Breadcrumb />
      </div>
      <div className="relative z-10 flex items-center gap-1.5 min-[360px]:gap-2 md:gap-3">
        {/* Leftmost of the right-hand cluster: Ask AI, admin, attendance, bell, profile. */}
        {/* Phones (under 768px) show only the credit badge, Ask AI and the profile picture: every other button is in the profile
            menu there (ProfileMenu appExtras). Tablets and computers show them all. The hidden buttons stay mounted
            (md:contents just removes their wrapper from the layout), so their panels still open from the menu and keep counting. */}
        {/* Phones keep the bar to the logo, credits, Ask AI and the picture (Hick's law); the streak shows on Home there. */}
        <span className="hidden md:contents">
          <StreakBadge />
        </span>
        <CreditsBadge />
        {/* Ask AI lives at the foot of the sidebar on a computer; search and the light/dark switch take its place here. */}
        <span className="contents lg:hidden">
          <AskAiButton />
        </span>
        <TopBarTools />
        {/* Owner only: the teacher's permanent notes on each student, right beside Ask AI. */}
        {isOwner && (
          <div className="hidden md:contents">
            <StudentNotesPanel />
          </div>
        )}
        {/* Moved here from AppDock's own row of icons, by direct
            instruction, it was the one dock item that wasn't an everyday
            destination for every signed-in visitor (just the single admin
            account), so it reads better as a utility icon next to
            notifications than as a sixth, role-gated tab sitting among
            Home/Lessons/Friends/Messages/Settings. Same `h-9 w-9 rounded-lg`
            treatment as the bell right next to it, so the two read as one
            matched pair of icon buttons rather than two different styles. */}
        {/* Buttons sit in one pressed-in tray so they read as raised keys set into the bar. */}
        <div className="flex items-center gap-1.5">
        <div className="hidden md:contents">
        {/* Friends only where nothing else offers it: tablets (the dock has no Friends). From lg the sidebar has it; on phones the profile menu does.
            No live classes button: Lessons is already in the dock and the sidebar. */}
        <span className="contents lg:hidden">
          <FriendsTopLink />
        </span>
        {/* From lg the sidebar lists the admin sections, so the shortcut is only for tablets. */}
        {isAdmin && (
          <span className="contents lg:hidden">
            <AdminTopLink />
          </span>
        )}
        {/* Owner only. Quick Present/No-show from anywhere, by direct instruction, the
            full roster at Schedule → Attendance still exists for
            history/cancellation, this is just the fast path for the one
            everyday action (mark today's classes) without a full admin-page
            navigation first. */}
        {isOwner && <AdminAttendanceQuickPanel />}
        <NotificationBell />
        {/* The admin's alerts (Discord, stopped jobs, what is waiting), right before the profile picture. */}
        {isAdmin && <AdminAlertsButton cards={alertCards} />}
        </div>
        <ProfileAvatarLink isAdmin={isAdmin} />
        </div>
      </div>
      </div>
    </header>
  );
}
