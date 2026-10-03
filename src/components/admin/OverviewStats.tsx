"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { OverviewStats as OverviewStatsData } from "@/lib/admin";

export interface OverviewStatsProps {
  stats: OverviewStatsData;
  children?: ReactNode;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const container = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

export function OverviewStats({ stats, children }: OverviewStatsProps) {
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
            <p className="text-small font-medium uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className={`mt-2 text-body font-semibold ${card.highlight ? "text-[rgb(var(--c-s-50))]" : "text-slate-50"}`}>
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div variants={item} className="flex flex-wrap gap-3">
        <Link
          href="/admin/payments"
          className="rounded-xl px-4 py-2.5 text-small font-medium text-slate-200 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
        >
          Review pending payments{stats.pendingPayments > 0 ? ` (${stats.pendingPayments})` : ""} →
        </Link>
        <Link
          href="/admin/schedule?view=ATTENDANCE"
          className="rounded-xl px-4 py-2.5 text-small font-medium text-slate-200 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
        >
          Lesson bookings →
        </Link>
        <Link
          href="/admin/users"
          className="rounded-xl px-4 py-2.5 text-small font-medium text-slate-200 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
        >
          Manage users →
        </Link>
      </motion.div>

      {/* Module health is slow to compute (two counts per scale), so the page
          streams it in through this slot instead of making the whole
          overview wait for it. */}
      <motion.div variants={item}>{children}</motion.div>
    </motion.div>
  );
}
