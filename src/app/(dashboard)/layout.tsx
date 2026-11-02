import { practiceBannerAllowed } from "@/lib/emailPreferences";
import { PullToRefreshMain } from "@/components/layout/PullToRefreshMain";
import { ScrollAssist } from "@/components/layout/ScrollAssist";
import { DeckStack } from "@/components/layout/DeckStack";
import { AutoRefresh } from "@/components/layout/AutoRefresh";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveAnnouncementForUser } from "@/lib/announcements";
import { LATEST_ENTRY } from "@/lib/changelog";
import { NavPendingGate } from "@/components/layout/NavPendingGate";
import { SwipeBack } from "@/components/layout/SwipeBack";
import { AppDock } from "@/components/layout/AppDock";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { WhatsNewProvider } from "@/components/layout/WhatsNewProvider";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { AddToHomePrompt } from "@/components/pwa/AddToHomePrompt";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { OwnerStarProvider } from "@/components/ui/OwnerStar";
import { isOwnerEmail, OWNER_EMAIL } from "@/lib/adminNotifications";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { phoneVerifyMode } from "@/lib/phoneVerification";
import { TopBanners } from "@/components/ui/TopBanners";
import { BillBar } from "@/components/billing/BillBar";
import { MeStatusProvider } from "@/components/layout/MeStatusProvider";
import { getMeStatus } from "@/lib/meStatus";
import { getSidebarCards } from "@/lib/sidebarCards";
import { getAdminNavBadges } from "@/lib/admin";
import { getPricingConfig } from "@/lib/pricing";
import { getDiscountPercent } from "@/lib/accountDiscounts";
import { PricingProvider } from "@/components/billing/PricingContext";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  // Everything the shell needs is asked for at once, not one after another (it ran on every page).
  const [user, activeAnnouncement, verifyMode, meStatus, owner, sidebarCards, pricing, personalDiscountPercent] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingTourSeenAt: true, lastSeenPatchVersion: true, phone: true, phoneVerifiedAt: true, phoneRequired: true, discordId: true, notifyEmailReminders: true } }),
    getActiveAnnouncementForUser(session.user.id),
    phoneVerifyMode(),
    getMeStatus(session.user.id),
    prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } }),
    getSidebarCards(session.user.id, session.user.role ?? "STUDENT", session.user.role === "ADMIN" && isOwnerEmail(session.user.email)).catch(() => []),
    getPricingConfig(),
    getDiscountPercent(session.user.id),
  ]);

  // Text confirmation is off by default. When the owner switches it on, an account made while it was on has to
  // finish confirming its number; older accounts are never blocked, they get a short popup (below) instead.
  if (verifyMode && user?.phoneRequired && !user.phoneVerifiedAt) redirect("/verify-phone");

  const shouldShowTour = !user?.onboardingTourSeenAt;
  // The tour goes first: a brand-new account never gets the tour and the "what's new" popup stacked on top of each other.
  // Once per account for each new version, and not on top of the first-visit tour.
  const showWhatsNew = !shouldShowTour && user?.lastSeenPatchVersion !== LATEST_ENTRY.version;
  // Anyone with no number on file is asked (or no confirmed one, when text confirmation is on).
  const needsPhone = verifyMode ? !user?.phoneVerifiedAt : !user?.phone;
  const promptPhone = needsPhone && !shouldShowTour && !showWhatsNew && (await getBoolSetting("phone.promptExisting"));
  const promptSeconds = promptPhone ? await getNumberSetting("phone.promptSeconds") : 0;
  // Anyone who has not connected Discord is reminded (never over the tour or the "what's new" popup).
  // Whether it still applies (connected or not) is decided live in the browser, so the server only says it is switched on.
  const promptDiscord = !shouldShowTour && !showWhatsNew && (await getBoolSetting("discord.promptEnabled"));
  const discordPrompt = promptDiscord
    ? { seconds: await getNumberSetting("discord.promptSeconds"), repeatMinutes: await getNumberSetting("discord.promptRepeatMinutes") }
    : null;
  // The practice banner is a practice reminder: it needs the owner's "Practice reminders" switch (Settings > Reminders) on AND the
  // person's own "Practice and class reminders" switch (Settings > Notification settings) on.
  const promptPractice =
    !shouldShowTour &&
    !showWhatsNew &&
    practiceBannerAllowed({ ownerEnabled: await getBoolSetting("reminders.practiceEnabled"), prefs: { notifyEmailReminders: user?.notifyEmailReminders ?? false } });
  const practicePrompt = promptPractice
    ? { seconds: await getNumberSetting("practice.promptSeconds"), repeatMinutes: await getNumberSetting("practice.promptRepeatMinutes") }
    : null;
  const isAdmin = session.user.role === "ADMIN";
  const isOwner = isAdmin && isOwnerEmail(session.user.email);
  // The waiting counts beside the admin sections in the sidebar.
  const adminBadges = isAdmin ? await getAdminNavBadges().catch(() => ({})) : {};

  return (
    <OwnerStarProvider ownerId={owner?.id ?? null}>
    <MeStatusProvider initial={meStatus}>
    <PricingProvider pricing={pricing} personalDiscountPercent={personalDiscountPercent}>
    <WhatsNewProvider entry={LATEST_ENTRY} showInitially={showWhatsNew}>
    <div data-surface="app" className="pad-safe-x shell-lock fixed inset-0 flex bg-ground">
      {/* Plain ground, no photo or colored wallpaper behind the app (the owner's choice, 2026-10-29). */}
      {/* fixed inset-0, not a viewport-unit height: the shell is pinned to the
          visible viewport edges, so it can never be taller or shorter than
          what is on screen. Viewport units were the root cause of the strip
          under the dock: 100vh/100svh/100dvh each disagree with the visible
          area at some point while a phone browser's toolbar animates, and
          body (min-h-screen) then let the document scroll the shell out of
          frame. globals.css now also locks the document itself for any page
          containing [data-surface="app"], so nothing can pan sideways or
          vertically except <main>. */}
      {/* pt-16: TopBar is `position: fixed` now (see its own comment for
          why, it used to disappear behind whatever "on-screen stuff" the
          visitor was navigating back from, by direct instruction it's now
          pinned and un-hideable instead), so it no longer reserves its own
          64px here by sitting in flow. This padding reserves that same
          64px so AnnouncementBanner/main start right below it instead of
          rendering underneath it. */}
      <div className="app-shell-col shell-lock flex min-w-0 flex-1 flex-col lg:pl-52">
        <TopBar isAdmin={isAdmin} isOwner={isOwner} alertCards={isAdmin ? sidebarCards : []} />
        <AnnouncementBanner announcement={activeAnnouncement} />
        {/* An open renewal bill, until it is sent: cannot be closed (BillBar.tsx). */}
        <BillBar />
        {/* How far down the page you are, in place of a scrollbar (see .scroll-progress in globals.css). */}
        <div aria-hidden className="status-bar-fill" />
        <div aria-hidden className="scroll-progress scroll-progress-app" />
        {/* pb-32 at every width (the bottom padding used to be overridden by md:py-10, which left only 40px under the last content on a desktop, so the always-on dock covered it), the floating AppDock now
            covers phone widths too (fixed, not in flow), so this reserved
            clearance is no longer a desktop-only concern. overscroll-contain
            stops this scroll area's own momentum/rubber-banding from
            chaining up to the body once it hits the top/bottom, without
            it, an iOS overscroll bounce here could visibly tug at the fixed
            shell around it, the same "things move weird" complaint. */}
        <PullToRefreshMain className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain app-scroll-under-bar px-4 pb-32 md:px-6 md:pb-32 lg:px-8 lg:pb-8"><NavPendingGate>{children}</NavPendingGate></PullToRefreshMain>
      </div>
      <SwipeBack />
      <AutoRefresh />
      <Suspense fallback={null}>
        <ScrollAssist />
      </Suspense>
      <DeckStack />
      <div className="lg:hidden">
        <AppDock isAdmin={isAdmin} />
      </div>
      <AppSidebar cards={sidebarCards} isAdmin={isAdmin} adminBadges={adminBadges} />
      <CommandMenu isAdmin={isAdmin} />
            <Suspense fallback={null}>
        <OnboardingTour autoShow={shouldShowTour} />
      </Suspense>
      <AddToHomePrompt suppressed={shouldShowTour || showWhatsNew} />
      <TopBanners phone={promptPhone ? { seconds: promptSeconds, verifying: verifyMode } : null} discord={discordPrompt} practice={practicePrompt} />
    </div>
    </WhatsNewProvider>
    </PricingProvider>
    </MeStatusProvider>
    </OwnerStarProvider>
  );
}
