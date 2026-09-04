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
    <div className="relative flex h-dvh overflow-hidden bg-slate-950">
      {/* No photographic backdrop behind the app shell, deliberately. The
          previous system wallpapered every authenticated page with a piano
          photo; on paper that reads as a smudge under the text rather than
          atmosphere, and it forced a heavy scrim that muddied every surface
          sitting on it. Photography now appears only where it is the subject
          (the marketing pages), never as a bed for UI. */}
      {/* h-dvh, not h-screen: same reasoning as marketing.css's own
          `--stage-height`. On a real phone/tablet, `100vh` is measured
          against the tallest the browser chrome ever gets, not what's
          actually visible once Safari's toolbar is showing. That gap is
          exactly why the bottom dock could end up clipped below the real,
          currently-visible viewport (worst in landscape, where the toolbar
          eats a bigger share of a shorter screen), and why `main`'s own
          scroll area (`overflow-y-auto` below) never had a scrollbar
          on-screen to reveal the difference. `dvh` tracks the real,
          current viewport instead of the theoretical maximum. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <AnnouncementBanner announcement={activeAnnouncement} />
        {/* pb-28 at every width, not just md: — the floating AppDock now
            covers phone widths too (fixed, not in flow), so this reserved
            clearance is no longer a desktop-only concern. */}
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-28 md:px-8 md:py-10">{children}</main>
      </div>
      <AppDock isAdmin={isAdmin} unreadMessageCount={unreadMessageCount} />
      <CommandMenu isAdmin={isAdmin} />
      <WhatsNewModal show={shouldShowWhatsNew} entry={LATEST_ENTRY} />
      <Suspense fallback={null}>
        <OnboardingTour autoShow={shouldShowTour} />
      </Suspense>
    </div>
  );
}
