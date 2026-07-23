import Link from "next/link";
import { BADGES } from "@/lib/badges";

interface BadgeSummaryProps {
  earnedCount: number;
  currentStreak: number;
}

export function BadgeSummary({ earnedCount, currentStreak }: BadgeSummaryProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Badges</p>
          <p className="mt-1 font-serif text-xl text-neutral-50">
            {earnedCount} of {BADGES.length} earned
          </p>
        </div>
        {currentStreak > 0 && (
          <div className="border-l border-neutral-800 pl-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Streak</p>
            <p className="mt-1 font-serif text-xl text-neutral-50">
              {currentStreak} day{currentStreak === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
      <Link href="/account#badges" className="text-xs text-neutral-500 transition hover:text-amber-300">
        View all →
      </Link>
    </div>
  );
}
