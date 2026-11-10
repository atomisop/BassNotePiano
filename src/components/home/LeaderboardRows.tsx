import type { CSSProperties } from "react";
import { Medal } from "@/components/ui/appIcons";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "@/lib/leaderboard";

/** "5 day streak · 3 badges": the quiet line under a name. */
function detail(r: LeaderboardRow): string {
  return `${r.streak} day streak · ${r.badges} badge${r.badges === 1 ? "" : "s"}`;
}

/**
 * Leaderboard rows: place, photo, name, this week's minutes, with the streak and badges as one quiet line. Rows, not boxes, so the
 * list reads as one thing (DESIGN.md, Hierarchy rule 8); only your own row is tinted and bright, everyone else is a step quieter.
 */
export function LeaderboardRows({ rows, viewerId, compact = false }: { rows: LeaderboardRow[]; viewerId: string; compact?: boolean }) {
  return (
    <ol className="grid divide-y divide-slate-50/6">
      {rows.map((r, i) => {
        const me = r.userId === viewerId;
        return (
          <li
            key={r.userId}
            style={{ "--i": i } as CSSProperties}
            className={cn("stagger-item flex items-center gap-3 px-2.5 py-2.5", me && "rounded-control bg-signal/10")}
          >
            <span className="w-6 shrink-0 text-center text-small font-medium tabular-nums text-slate-500">{r.place}</span>
            <Avatar image={r.image} label={r.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-small", me ? "font-semibold text-slate-50" : "font-medium text-slate-200")}>
                {r.name}
                {me && <span className="font-normal text-slate-400"> (you)</span>}
              </span>
              {!compact && <span className="mt-0.5 block truncate text-caption text-slate-500">{detail(r)}</span>}
            </span>
            <span className="shrink-0 text-right">
              <span className={cn("text-small font-semibold tabular-nums", me ? "text-slate-50" : "text-slate-300")}>{r.minutes}</span>
              <span className="ml-1 text-caption text-slate-500">min</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The week's leader, set apart above the rest (a tie shares the spot): a bigger photo, the name and the minutes as the one figure.
 */
export function LeaderSpot({ rows, viewerId }: { rows: LeaderboardRow[]; viewerId: string }) {
  return (
    <ol className="grid gap-3">
      {rows.map((r) => {
        const me = r.userId === viewerId;
        return (
          <li key={r.userId} className="flex items-center gap-3">
            <span className="relative shrink-0">
              <Avatar image={r.image} label={r.name} size="md" />
              <span aria-hidden className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-neu-base text-signal-fg shadow-raised-low">
                <Medal className="h-3 w-3" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold text-slate-50">
                {r.name}
                {me && <span className="font-normal text-slate-400"> (you)</span>}
              </span>
              <span className="block truncate text-caption text-slate-500">{detail(r)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-title font-semibold leading-none tabular-nums text-slate-50">{r.minutes}</span>
              <span className="mt-1 block text-caption text-slate-500">min</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
