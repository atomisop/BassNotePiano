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

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

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
  const shouldShowWhatsNew = !shouldShowTour && (!user?.lastSeenPatchNotesAt || !isSameUtcDay(user.lastSeenPatchNotesAt, new Date()));
  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-950">
      {/* No photographic backdrop behind the app shell, deliberately. The
          previous system wallpapered every authenticated page with a piano
          photo; on paper that reads as a smudge under the text rather than
          atmosphere, and it forced a heavy scrim that muddied every surface
          sitting on it. Photography now appears only where it is the subject
          (the marketing pages), never as a bed for UI. */}
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
