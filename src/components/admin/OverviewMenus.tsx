"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

const BUTTON =
  "tap inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-slate-50/6 px-4 text-small font-semibold text-slate-100 ring-1 ring-inset ring-slate-50/10 transition hover:bg-slate-50/10";

/**
 * The two buttons at the top of the Overview, side by side and alike: Needs you (the jobs waiting right now) and Follow up (the people to
 * nudge). Each has an orange count and drops its list down full width under both buttons; opening one closes the other. Both lists are
 * drawn by the server and passed in, so they keep their own buttons and reminders.
 */
export function OverviewMenus({ needsCount, followCount, needs, follow, className }: { needsCount: number; followCount: number; needs: ReactNode; follow: ReactNode; className?: string }) {
  const [open, setOpen] = useState<"needs" | "follow" | null>(null);
  const toggle = (which: "needs" | "follow") => setOpen((cur) => (cur === which ? null : which));

  const button = (which: "needs" | "follow", label: string, count: number, panelId: string) =>
    count === 0 ? (
      <span className="inline-flex min-h-11 items-center rounded-full px-4 text-small font-medium text-slate-500 ring-1 ring-inset ring-slate-50/8">{label} · all clear</span>
    ) : (
      <button type="button" onClick={() => toggle(which)} aria-expanded={open === which} aria-controls={panelId} className={BUTTON}>
        {label}
        <span className="min-w-6 rounded-full bg-signal px-1.5 py-0.5 text-center text-caption font-semibold tabular-nums text-white">{count}</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 text-slate-400 transition-transform", open === which && "rotate-180")} />
      </button>
    );

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {button("needs", "Needs you", needsCount, "overview-needs")}
        {button("follow", "Follow up", followCount, "overview-follow")}
      </div>
      <div id="overview-needs" hidden={open !== "needs"} className="mt-3">
        {needs}
      </div>
      <div id="overview-follow" hidden={open !== "follow"} className="mt-3">
        {follow}
      </div>
    </div>
  );
}
