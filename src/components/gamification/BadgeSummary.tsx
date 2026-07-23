import Link from "next/link";
import { BADGES } from "@/lib/badges";

interface BadgeSummaryProps {
  earnedCount: number;
  currentStreak: number;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function StreakDots({ currentStreak }: { currentStreak: number }) {
  const filled = Math.min(currentStreak, 7);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { letter: DAY_LETTERS[d.getDay()], isToday: i === 6, isFilled: i >= 7 - filled };
  });

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {days.map((day, i) => (
        <span
          key={i}
          title={day.isToday ? "Today" : undefined}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition ${
            day.isFilled
              ? "bg-amber-400 text-neutral-950"
              : `border text-neutral-600 ${day.isToday ? "border-amber-400/50" : "border-neutral-800"}`
          }`}
        >
          {day.letter}
        </span>
      ))}
    </div>
  );
}

export function BadgeSummary({ earnedCount, currentStreak }: BadgeSummaryProps) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Badges</p>
          <p className="mt-1 font-serif text-xl text-neutral-50">
            {earnedCount} of {BADGES.length} earned
          </p>
        </div>
        <div className="sm:border-l sm:border-neutral-800 sm:pl-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
            {currentStreak > 0 ? `${currentStreak} day streak` : "Streak"}
          </p>
          <StreakDots currentStreak={currentStreak} />
        </div>
      </div>
      <Link href="/account#badges" className="text-xs text-neutral-500 transition hover:text-amber-300">
        View all →
      </Link>
    </div>
  );
}
