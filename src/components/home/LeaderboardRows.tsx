import { Flame, Medal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "@/lib/leaderboard";

/** Leaderboard rows: place, photo, name, this week's minutes, streak and badges. Your own row is tinted. */
export function LeaderboardRows({ rows, viewerId, compact = false }: { rows: LeaderboardRow[]; viewerId: string; compact?: boolean }) {
  return (
    <ol className="grid gap-1.5">
      {rows.map((r) => {
        const me = r.userId === viewerId;
        return (
          <li
            key={r.userId}
            className={cn("flex items-center gap-3 rounded-xl px-2.5 py-2", me ? "bg-signal/12" : "bg-neu-base shadow-pressed-low")}
          >
            <span
              className={cn(
                "w-6 shrink-0 text-center text-small font-bold tabular-nums",
                r.place === 1 ? "text-signal-fg" : "text-slate-400",
              )}
            >
              {r.place}
            </span>
            <Avatar image={r.image} label={r.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold text-slate-50">
                {r.name}
                {me && <span className="font-normal text-slate-400"> (you)</span>}
              </span>
              {!compact && (
                <span className="mt-0.5 flex items-center gap-3 text-caption text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Flame aria-hidden className="h-3.5 w-3.5" />
                    {r.streak} day streak
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Medal aria-hidden className="h-3.5 w-3.5" />
                    {r.badges} badge{r.badges === 1 ? "" : "s"}
                  </span>
                </span>
              )}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-small font-bold tabular-nums text-slate-50">{r.minutes}</span>
              <span className="block text-caption text-slate-500">min</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
