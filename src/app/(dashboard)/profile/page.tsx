import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isObjectStorageConfigured } from "@/lib/storage";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";
import { ProfileEditButton } from "./ProfileEditButton";

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
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-amber-400/30 bg-amber-400/10">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-serif text-2xl text-amber-300">
              {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Profile</p>
          <h1 className="mt-1 font-serif text-2xl text-slate-50">{user.name ?? "Student"}</h1>
          {user.username && <p className="text-sm text-slate-500">@{user.username}</p>}
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
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
            {user.currentStreak > 0 ? `${user.currentStreak} day streak` : "Streak"}
          </p>
          <StreakDots currentStreak={user.currentStreak} />
        </div>
        <div className="glass-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Longest streak</p>
          <p className="mt-2 font-serif text-2xl text-slate-50">
            {user.longestStreak} day{user.longestStreak === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg text-slate-50">Badges</h2>
          <p className="text-xs text-slate-500">
            {earnedCodes.length} of {BADGES.length} earned
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-500">Earned and locked achievements — hover a badge to see how to unlock it.</p>
        <div className="mt-4 glass-surface p-6">
          <BadgeGrid earnedCodes={new Set(earnedCodes)} />
        </div>
      </div>
    </div>
  );
}
