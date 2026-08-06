import Link from "next/link";
import { BADGES } from "@/lib/badges";
import { StreakDots } from "@/components/gamification/StreakDots";

interface BadgeSummaryProps {
  earnedCount: number;
  currentStreak: number;
}

export function BadgeSummary({ earnedCount, currentStreak }: BadgeSummaryProps) {
  return (
    <div className="flex flex-col gap-5 glass-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Badges</p>
          <p className="mt-1 font-serif text-xl text-slate-50">
            {earnedCount} of {BADGES.length} earned
          </p>
        </div>
        <div className="sm:border-l sm:border-white/10 sm:pl-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
            {currentStreak > 0 ? `${currentStreak} day streak` : "Streak"}
          </p>
          <StreakDots currentStreak={currentStreak} />
        </div>
      </div>
      <Link href="/profile" className="text-xs text-slate-500 transition hover:text-amber-300">
        View all →
      </Link>
    </div>
  );
}
