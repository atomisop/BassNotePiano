import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTotalUnreadMessageCount } from "@/lib/messages";
import { getTotalUnreadGroupMessageCount } from "@/lib/groupMessages";
import { getActiveAnnouncementForUser } from "@/lib/announcements";
import { LATEST_ENTRY } from "@/lib/changelog";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { WhatsNewModal } from "@/components/layout/WhatsNewModal";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";

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
    <div className="relative flex h-screen overflow-hidden">
      {/* One backdrop, shared by every authenticated page via this layout — never
          re-rendered on navigation within (dashboard), so it doesn't flash between
          routes. Dense scrim: this frame holds text-heavy UI everywhere (tables,
          forms, chat), so the photo has to stay atmospheric texture, not compete. */}
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.appShell} scrim="dense" priority sizes="100vw" />
      </div>
      <Sidebar name={session.user.name} isAdmin={isAdmin} unreadMessageCount={unreadMessageCount} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <AnnouncementBanner announcement={activeAnnouncement} />
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-24 md:px-8 md:py-10 md:pb-10">{children}</main>
      </div>
      <MobileTabBar isAdmin={isAdmin} unreadMessageCount={unreadMessageCount} />
      <WhatsNewModal show={shouldShowWhatsNew} entry={LATEST_ENTRY} />
      <Suspense fallback={null}>
        <OnboardingTour autoShow={shouldShowTour} />
      </Suspense>
    </div>
  );
}
