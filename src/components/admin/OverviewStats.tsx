"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { OverviewStats as OverviewStatsData, ModuleHealthRow } from "@/lib/admin";

export interface OverviewStatsProps {
  stats: OverviewStatsData;
  moduleHealth: ModuleHealthRow[];
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const container = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

export function OverviewStats({ stats, moduleHealth }: OverviewStatsProps) {
  const cards = [
    { label: "Total users", value: stats.totalUsers.toLocaleString() },
    { label: "Curriculum access", value: stats.curriculumUsers.toLocaleString() },
    { label: "Pending payments", value: stats.pendingPayments.toLocaleString(), highlight: stats.pendingPayments > 0 },
    { label: "Total revenue", value: formatUsd(stats.totalRevenueCents) },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="space-y-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <motion.div
            key={card.label}
            variants={item}
            className={`p-5 ${card.highlight ? "glass-surface-elevated" : "glass-surface"}`}
          >
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className={`mt-2 font-serif text-3xl ${card.highlight ? "text-[rgb(var(--c-s-50))]" : "text-slate-50"}`}>
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div variants={item} className="flex flex-wrap gap-3">
        <Link
          href="/admin/payments"
          className="rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
        >
          Review pending payments{stats.pendingPayments > 0 ? ` (${stats.pendingPayments})` : ""} →
        </Link>
        <Link
          href="/admin/bookings"
          className="rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
        >
          Lesson bookings →
        </Link>
        <Link
          href="/admin/users"
          className="rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
        >
          Manage users →
        </Link>
      </motion.div>

      <motion.div variants={item}>
        <h2 className="mb-1 font-serif text-xl text-slate-100">Module health</h2>
        <p className="mb-4 text-sm text-slate-500">Unlocks and completions across the whole user base.</p>
        <div className="overflow-hidden glass-surface">
          {moduleHealth.map((row, i) => {
            const rate = row.unlockedCount === 0 ? 0 : Math.round((row.completedCount / row.unlockedCount) * 100);
            return (
              <div
                key={row.slug}
                className={`flex flex-wrap items-center justify-between gap-4 px-6 py-4 ${
                  i > 0 ? "border-t border-ink/5" : ""
                }`}
              >
                <div>
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--c-s-50)/0.8)]">{row.code}</p>
                  <p className="text-slate-200">{row.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-slate-300">{row.unlockedCount}</p>
                    <p className="text-[11px] text-slate-600">unlocked</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-300">{row.completedCount}</p>
                    <p className="text-[11px] text-slate-600">completed</p>
                  </div>
                  <div className="w-14 text-right">
                    <p className="text-[rgb(var(--c-s-50))]">{rate}%</p>
                    <p className="text-[11px] text-slate-600">completion</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
