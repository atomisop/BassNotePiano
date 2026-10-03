import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTotalUnreadMessageCount } from "@/lib/messages";
import { getTotalUnreadGroupMessageCount } from "@/lib/groupMessages";
import { getActiveAnnouncementForUser } from "@/lib/announcements";
import { LATEST_ENTRY } from "@/lib/changelog";
import { AppDock } from "@/components/layout/AppDock";
import { TopBar } from "@/components/layout/TopBar";
import { WhatsNewModal } from "@/components/layout/WhatsNewModal";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { CommandMenu } from "@/components/layout/CommandMenu";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const [directUnreadCount, groupUnreadCount, user, activeAnnouncement] = await Promise.all([
    getTotalUnreadMessageCount(session.user.id),
    getTotalUnreadGroupMessageCount(session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { lastSeenPatchNotesAt: true, onboardingTourSeenAt: true } }),
    getActiveAnnouncementForUser(session.user.id),
  ]);
  const unreadMessageCount = directUnreadCount + groupUnreadCount;

  const shouldShowTour = !user?.onboardingTourSeenAt;
  // Deferred until the tour's been seen once — a brand-new account
  // shouldn't get the spotlight tour and the "what's new" popup stacked on
  // top of each other on the very first dashboard visit.
  //
  // Once per new release, not once per day: compares against the latest
  // changelog entry's own date, not "today" — the old check
  // (`!isSameUtcDay(lastSeenPatchNotesAt, now)`) meant anyone logging in on
  // a new calendar day saw the same "what's new" card again, forever, even
  // though nothing shipped. Marking it seen now holds until a genuinely
  // newer entry lands at the front of CHANGELOG.
  const shouldShowWhatsNew =
    !shouldShowTour && (!user?.lastSeenPatchNotesAt || user.lastSeenPatchNotesAt < new Date(LATEST_ENTRY.date));
  const isAdmin = session.user.role === "ADMIN";

  return (
    <div data-surface="app" className="relative flex h-[100svh] overflow-hidden bg-neu-base">
      {/* No photographic backdrop behind the app shell, deliberately. The
          previous system wallpapered every authenticated page with a piano
          photo; on paper that reads as a smudge under the text rather than
          atmosphere, and it forced a heavy scrim that muddied every surface
          sitting on it. Photography now appears only where it is the subject
          (the marketing pages), never as a bed for UI. */}
      {/* h-[100svh] (small viewport height — the size the browser chrome
          ever *shrinks* the viewport to), not h-dvh and not h-screen.
          h-screen/100vh was tried first and rejected: on a real phone,
          `100vh` is measured against the tallest the browser chrome ever
          gets, not what's actually visible once Safari's toolbar is
          showing, and that gap clipped the bottom dock below the real
          viewport. `dvh` (dynamic viewport height) was the fix for that —
          but "dynamic" means it's re-measured continuously, including
          mid-scroll while Safari's toolbar animates itself away, so the
          whole shell (TopBar, AppDock) visibly resized/shifted during a
          scroll gesture instead of staying put — reported live as "the top
          bar and bottom dock move in a weird way when scrolling." `svh`
          pins the shell to the smallest the viewport is ever going to be
          (toolbar fully expanded), so it never changes size once painted:
          the one trade-off is a sliver of empty space below the dock for
          the instant the toolbar auto-hides, which is a fixed, harmless gap
          rather than a moving one — far better than the shell itself
          reflowing under your thumb. */}
      {/* pt-16: TopBar is `position: fixed` now (see its own comment for
          why — it used to disappear behind whatever "on-screen stuff" the
          visitor was navigating back from, by direct instruction it's now
          pinned and un-hideable instead), so it no longer reserves its own
          64px here by sitting in flow. This padding reserves that same
          64px so AnnouncementBanner/main start right below it instead of
          rendering underneath it. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-16">
        <TopBar isAdmin={isAdmin} />
        <AnnouncementBanner announcement={activeAnnouncement} />
        {/* pb-28 at every width, not just md: — the floating AppDock now
            covers phone widths too (fixed, not in flow), so this reserved
            clearance is no longer a desktop-only concern. overscroll-contain
            stops this scroll area's own momentum/rubber-banding from
            chaining up to the body once it hits the top/bottom — without
            it, an iOS overscroll bounce here could visibly tug at the fixed
            shell around it, the same "things move weird" complaint. */}
        <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-6 pb-28 md:px-8 md:py-10">{children}</main>
      </div>
      <AppDock unreadMessageCount={unreadMessageCount} />
      <CommandMenu isAdmin={isAdmin} />
      <WhatsNewModal show={shouldShowWhatsNew} entry={LATEST_ENTRY} />
      <Suspense fallback={null}>
        <OnboardingTour autoShow={shouldShowTour} />
      </Suspense>
    </div>
  );
}
