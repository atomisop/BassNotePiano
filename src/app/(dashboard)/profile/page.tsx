import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isObjectStorageConfigured } from "@/lib/storage";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";
import { getFingerPracticeStatus } from "@/lib/fingerPractice";
import { ProfileEditButton } from "./ProfileEditButton";
import { WideLayout } from "@/components/layout/PageLayouts";
import { PageBack } from "@/components/ui/BackLink";
import { HeroBand } from "@/components/ui/HeroBand";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { Meta } from "@/components/ui/CardKit";
import { Flame, Settings, Trophy, Users } from "@/components/ui/appIcons";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/profile");

  const [user, badgeRows, practice] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        image: true,
        username: true,
        primaryInstrument: true,
        skillLevel: true,
        genres: true,
        learningGoal: true,
      },
    }),
    prisma.userBadge.findMany({ where: { userId: session.user.id }, select: { code: true } }),
    getFingerPracticeStatus(session.user.id),
  ]);
  if (!user) redirect("/login");

  const earnedCodes = badgeRows.map((b) => b.code);

  const displayName = user.name ?? "Student";

  return (
    <WideLayout className="space-y-6">
      {/* Profile isn't a dock destination. It's opened from the account
          menu in the top bar, from any of several other pages, or from a
          friend's own profile link, so there's no single page it "belongs"
          to. Back to the roadmap rather than guessing a referrer, so this
          never reads as a dead end reachable only via the dock icons. */}
      <div>
        <PageBack href="/dashboard" />
        {/* The page's title for screen readers and the phone's top bar; the band shows the same name. */}
        <h1 data-page-title="" className="sr-only">
          {displayName}
        </h1>
      </div>

      {/* The person is the hero: picture and name on the band, the streak as its quiet line, this week's days and Edit on the sheet. */}
      <HeroBand
        eyebrow="Profile"
        title={
          <span className="flex items-center gap-4">
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/16 ring-2 ring-white/40">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden className="flex h-full w-full items-center justify-center text-title font-semibold text-white">
                  {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span aria-hidden className="min-w-0 break-words">
              {displayName}
            </span>
          </span>
        }
        meta={
          <Meta
            items={[
              user.username && `@${user.username}`,
              practice.streak > 0 ? `${practice.streak} day streak` : "No streak right now",
              `Longest ${practice.longest ?? 0} day${practice.longest === 1 ? "" : "s"}`,
            ]}
          />
        }
      >
        <div className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          {/* The same practice streak as Home and the Streak page (one number everywhere, 2026-10-30). */}
          <div className="w-full min-w-0 max-w-sm sm:flex-1">
            <StreakDots currentStreak={practice.streak} />
          </div>
          <ProfileEditButton
            initialName={user.name}
            initialImage={user.image}
            initialUsername={user.username}
            storageConfigured={isObjectStorageConfigured()}
            initialMusicProfile={{
              primaryInstrument: user.primaryInstrument,
              skillLevel: user.skillLevel,
              genres: user.genres,
              learningGoal: user.learningGoal,
            }}
          />
        </div>
      </HeroBand>

      <ActionTiles
        title="Go to"
        items={[
          { href: "/streak", label: "Streak", detail: "Your practice days", icon: <Flame /> },
          { href: "/leaderboard", label: "Leaderboard", detail: "Where you stand", icon: <Trophy /> },
          { href: "/friends", label: "Friends", detail: "Practice together", icon: <Users /> },
          { href: "/account", label: "Settings", detail: "Email, phone, sign-in", icon: <Settings /> },
        ]}
      />

      <section aria-label="Badges" className="rounded-card bg-neu-base p-5 shadow-raised-low sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-small font-semibold uppercase tracking-caps text-slate-400">Badges</h2>
          <p className="text-small tabular-nums text-slate-500">
            {earnedCodes.length} of {BADGES.length} earned
          </p>
        </div>
        <div className="mt-4">
          <BadgeGrid earnedCodes={new Set(earnedCodes)} />
        </div>
      </section>
    </WideLayout>
  );
}
