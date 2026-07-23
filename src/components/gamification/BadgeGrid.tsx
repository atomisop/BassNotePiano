import type { BadgeCode } from "@prisma/client";
import { BADGES, type BadgeCategory } from "@/lib/badges";

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  COURSE: "Course completion",
  SOCIAL: "Social",
  STREAK: "Practice streaks",
};

const CATEGORY_ORDER: BadgeCategory[] = ["COURSE", "STREAK", "SOCIAL"];

interface BadgeGridProps {
  earnedCodes: Set<BadgeCode>;
}

// Server-renderable — the tooltip is pure CSS (group-hover), no client JS needed.
export function BadgeGrid({ earnedCodes }: BadgeGridProps) {
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const badges = BADGES.filter((b) => b.category === category);
        return (
          <div key={category}>
            <p className="mb-2.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              {CATEGORY_LABELS[category]}
            </p>
            <div className="flex flex-wrap gap-3">
              {badges.map((badge) => {
                const earned = earnedCodes.has(badge.code);
                return (
                  <div key={badge.code} className="group relative">
                    <div
                      className={`flex h-16 w-16 flex-col items-center justify-center rounded-2xl border text-center transition ${
                        earned
                          ? "border-amber-400/50 bg-amber-400/10"
                          : "border-slate-800 bg-slate-900/60 opacity-50"
                      }`}
                    >
                      <span className="text-2xl">{earned ? "🏅" : "🔒"}</span>
                    </div>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-center opacity-0 shadow-lg transition group-hover:opacity-100">
                      <p className="text-xs font-medium text-slate-100">{badge.label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{badge.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
