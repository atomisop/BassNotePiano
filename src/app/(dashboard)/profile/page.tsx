import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isObjectStorageConfigured } from "@/lib/storage";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";
import { getFingerPracticeStatus } from "@/lib/fingerPractice";
import { ProfileEditButton } from "./ProfileEditButton";
import { WideLayout } from "@/components/layout/PageLayouts";
import { BackLink, PageBack } from "@/components/ui/BackLink";

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

  return (
    <WideLayout>
      {/* Profile isn't a dock destination. It's opened from the account
          menu in the top bar, from any of several other pages, or from a
          friend's own profile link, so there's no single page it "belongs"
          to. Back to the roadmap rather than guessing a referrer, so this
          never reads as a dead end reachable only via the dock icons. */}
      <PageBack href="/dashboard" />
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-50/30 bg-neu-base shadow-pressed-low">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-body text-slate-50 font-semibold">
              {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium uppercase tracking-caps text-slate-400">Profile</p>
          <h1 data-page-title="" className="font-hero text-hero font-bold text-balance mt-1 text-slate-50">{user.name ?? "Student"}</h1>
          {user.username && <p className="text-small text-slate-500">@{user.username}</p>}
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

      {/* One practice card instead of two equal boxes: the streak is the line you read, the longest run a quiet figure beside it. */}
      <div className="mt-8 glass-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-title font-semibold tabular-nums text-slate-50">
            {practice.streak > 0 ? `${practice.streak} day streak` : "No streak right now"}
          </p>
          <p className="text-small tabular-nums text-slate-400">
            Longest {practice.longest ?? 0} day{practice.longest === 1 ? "" : "s"}
          </p>
        </div>
        {/* The same practice streak as Home and the Streak page (one number everywhere, 2026-10-30). */}
        <StreakDots currentStreak={practice.streak} />
      </div>

      <div className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title text-slate-50 font-semibold">Badges</h2>
          <p className="text-small text-slate-500">
            {earnedCodes.length} of {BADGES.length} earned
          </p>
        </div>
        <div className="mt-4 glass-surface p-6">
          <BadgeGrid earnedCodes={new Set(earnedCodes)} />
        </div>
      </div>
    </WideLayout>
  );
}
