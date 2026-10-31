import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isObjectStorageConfigured } from "@/lib/storage";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";
import { ProfileEditButton } from "./ProfileEditButton";
import { WideLayout } from "@/components/layout/PageLayouts";
import { BackLink, PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/profile");

  const [user, badgeRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        image: true,
        username: true,
        currentStreak: true,
        longestStreak: true,
        primaryInstrument: true,
        skillLevel: true,
        genres: true,
        learningGoal: true,
      },
    }),
    prisma.userBadge.findMany({ where: { userId: session.user.id }, select: { code: true } }),
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
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Profile</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1 text-slate-50">{user.name ?? "Student"}</h1>
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

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="glass-surface p-5">
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">
            {user.currentStreak > 0 ? `${user.currentStreak} day streak` : "Streak"}
          </p>
          <StreakDots currentStreak={user.currentStreak} />
        </div>
        <div className="glass-surface p-5">
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Longest streak</p>
          <p className="mt-2 text-body text-slate-50 font-semibold">
            {user.longestStreak} day{user.longestStreak === 1 ? "" : "s"}
          </p>
        </div>
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
