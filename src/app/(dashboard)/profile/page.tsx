import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";

export default async function ProfilePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/profile");

  const [user, badgeRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, username: true, currentStreak: true, longestStreak: true },
    }),
    prisma.userBadge.findMany({ where: { userId: session.user.id }, select: { code: true } }),
  ]);
  if (!user) redirect("/login");

  const earnedCodes = badgeRows.map((b) => b.code);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 font-serif text-2xl text-amber-300">
          {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Profile</p>
          <h1 className="mt-1 font-serif text-2xl text-slate-50">{user.name ?? "Student"}</h1>
          {user.username && <p className="text-sm text-slate-500">@{user.username}</p>}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
            {user.currentStreak > 0 ? `${user.currentStreak} day streak` : "Streak"}
          </p>
          <StreakDots currentStreak={user.currentStreak} />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
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
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <BadgeGrid earnedCodes={new Set(earnedCodes)} />
        </div>
      </div>

      <p className="mt-8 text-xs text-slate-600">
        Want to edit your name, username, or photo? Head to{" "}
        <Link href="/account" className="text-amber-300 hover:text-amber-200">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
