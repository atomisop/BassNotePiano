"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OverviewStats as OverviewStatsData } from "@/lib/admin";
import { buttonVariants } from "@/components/ui/button";

export interface OverviewStatsProps {
  stats: OverviewStatsData;
  children?: ReactNode;
}

export function OverviewStats({ stats, children }: OverviewStatsProps) {
  // Users, pending payments and revenue already show above (the two trend cards and "Needs you now"), so only
  // what is not shown elsewhere stays here.
  const cards = [{ label: "With full lesson access", value: stats.curriculumUsers.toLocaleString(), highlight: false }];

  // No entrance animation: the owner opens Overview many times a day, and the page arrival already fades it in.
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`p-5 ${card.highlight ? "glass-surface-elevated" : "glass-surface"}`}
          >
            <p className="text-small font-medium text-slate-500">{card.label}</p>
            <p className={`mt-2 text-body font-semibold ${card.highlight ? "text-slate-50" : "text-slate-50"}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/payments"
          className={buttonVariants({ variant: "secondary" })}
        >
          Payments{stats.pendingPayments > 0 ? ` (${stats.pendingPayments})` : ""}
        </Link>
        <Link
          href="/admin/schedule?view=ATTENDANCE"
          className={buttonVariants({ variant: "secondary" })}
        >
          Attendance
        </Link>
        <Link
          href="/admin/users"
          className={buttonVariants({ variant: "secondary" })}
        >
          Accounts
        </Link>
      </div>

      {/* Module health is slow to compute (two counts per scale), so the page
          streams it in through this slot instead of making the whole
          overview wait for it. */}
      <div>
        <details className="group rounded-card bg-neu-base shadow-raised-low">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-body font-semibold text-slate-50 [&::-webkit-details-marker]:hidden">
            Progress by scale
            <span className="text-small font-normal text-slate-400 group-open:hidden">Show</span>
          </summary>
          <div className="px-5 pb-5">{children}</div>
        </details>
      </div>
    </div>
  );
}
