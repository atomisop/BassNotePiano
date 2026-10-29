"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { OverviewStats as OverviewStatsData } from "@/lib/admin";
import { buttonVariants } from "@/components/ui/button";

export interface OverviewStatsProps {
  stats: OverviewStatsData;
  children?: ReactNode;
}

const container = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

export function OverviewStats({ stats, children }: OverviewStatsProps) {
  // Users, pending payments and revenue already show above (the two trend cards and "Needs you now"), so only
  // what is not shown elsewhere stays here.
  const cards = [{ label: "With full lesson access", value: stats.curriculumUsers.toLocaleString(), highlight: false }];

  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="space-y-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <motion.div
            key={card.label}
            variants={item}
            className={`p-5 ${card.highlight ? "glass-surface-elevated" : "glass-surface"}`}
          >
            <p className="text-small font-medium text-slate-500">{card.label}</p>
            <p className={`mt-2 text-body font-semibold ${card.highlight ? "text-slate-50" : "text-slate-50"}`}>
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div variants={item} className="flex flex-wrap gap-3">
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
      </motion.div>

      {/* Module health is slow to compute (two counts per scale), so the page
          streams it in through this slot instead of making the whole
          overview wait for it. */}
      <motion.div variants={item}>
        <details className="group rounded-card bg-neu-base shadow-raised-low">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-body font-semibold text-slate-50 [&::-webkit-details-marker]:hidden">
            Progress by scale
            <span className="text-small font-normal text-slate-400 group-open:hidden">Show</span>
          </summary>
          <div className="px-5 pb-5">{children}</div>
        </details>
      </motion.div>
    </motion.div>
  );
}
