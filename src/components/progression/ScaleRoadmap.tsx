"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import type { ProgressStatus } from "@prisma/client";
import type { ScaleAccessState } from "@/lib/access";
import { ProOverrideConfirmModal } from "@/components/progression/ProOverrideConfirmModal";

export interface ScaleRoadmapProps {
  roadmap: ScaleAccessState[];
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  LOCKED: "Locked",
  AVAILABLE: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

const STATUS_DOT: Record<ProgressStatus, string> = {
  LOCKED: "bg-slate-700",
  AVAILABLE: "bg-slate-500",
  IN_PROGRESS: "bg-amber-400",
  COMPLETED: "bg-emerald-400",
};

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

function ChecklistDots({ scale }: { scale: ScaleAccessState }) {
  const items = [
    { label: "Read", done: scale.moduleRead },
    { label: "Practice", done: scale.practiceCompleted },
    { label: "Quiz", done: scale.quizPassed },
  ];
  return (
    <div className="mt-4 flex items-center gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${item.done ? "bg-amber-400" : "bg-slate-700"}`} />
          <span className={`text-[11px] ${item.done ? "text-slate-300" : "text-slate-600"}`}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
      <path d="M5 12l5 5L19 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StepMarker({ index, status, locked }: { index: number; status: ProgressStatus; locked: boolean }) {
  if (status === "COMPLETED") {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400 text-slate-950">
        <CheckIcon />
      </div>
    );
  }
  if (locked) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/10 bg-slate-950 text-slate-600">
        <LockIcon />
      </div>
    );
  }
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold ${
        status === "IN_PROGRESS"
          ? "border-amber-400 bg-amber-400/10 text-amber-300"
          : "border-white/15 bg-slate-950 text-slate-400"
      }`}
    >
      {index + 1}
    </div>
  );
}

function ctaLabel(scale: ScaleAccessState): string {
  if (scale.requiresOverrideConfirm) return "Unlock ahead";
  if (scale.reason === "locked") return "Unlock full curriculum — $99";
  if (scale.status === "COMPLETED") return "Review";
  if (scale.status === "IN_PROGRESS") return "Continue";
  return "Start";
}

export function ScaleRoadmap({ roadmap }: ScaleRoadmapProps) {
  const router = useRouter();
  const { update } = useSession();
  const [pendingOverride, setPendingOverride] = useState<ScaleAccessState | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleCardClick(scale: ScaleAccessState) {
    if (scale.requiresOverrideConfirm) {
      setPendingOverride(scale);
      return;
    }
    if (scale.canAccess) {
      router.push(`/scales/${scale.scaleGroup.slug}`);
      return;
    }
    // Not accessible at all — the only way forward is buying the full
    // curriculum, regardless of which scale was clicked (per-scale purchase
    // no longer exists), so every locked card is a soft ad for /billing/curriculum.
    router.push("/billing/curriculum");
  }

  async function handleConfirmOverride() {
    if (!pendingOverride) return;
    setConfirming(true);
    // Middleware gates /scales/[slug] off the JWT, not the DB — and that
    // token can still say hasCurriculumAccess: false if it was minted before
    // curriculum access was granted. Without this refresh, the ?override=confirmed
    // request middleware sees is built on stale claims, so it bounces the
    // navigation straight back here — looking like "Confirm" did nothing.
    await update();
    router.push(`/scales/${pendingOverride.scaleGroup.slug}?override=confirmed`);
    setConfirming(false);
    setPendingOverride(null);
  }

  return (
    <>
      <motion.div variants={gridContainer} initial="hidden" animate="visible" className="relative mx-auto max-w-2xl">
        {roadmap.map((scale, index) => {
          // "locked" is purely visual now — every card is clickable, since
          // an inaccessible scale routes to /billing/curriculum rather than
          // sitting inert (buying the curriculum unlocks all of them at
          // once, so there's no reason to block the purchase entry point).
          const locked = !scale.canAccess;
          const isLast = index === roadmap.length - 1;
          return (
            <motion.div key={scale.scaleGroup.slug} variants={gridItem} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <StepMarker index={index} status={scale.status} locked={locked} />
                {!isLast && <span className="w-px flex-1 border-l-2 border-dotted border-white/10" />}
              </div>

              <button
                type="button"
                onClick={() => handleCardClick(scale)}
                className={`group mb-4 flex-1 rounded-2xl border p-5 text-left transition ${
                  locked
                    ? "border-white/10 bg-slate-900/40 hover:border-amber-400/30"
                    : "border-white/10 bg-white/[0.04] backdrop-blur-xl hover:border-amber-400/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
                    {scale.scaleGroup.code}
                  </p>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[scale.status]}`} />
                    {STATUS_LABEL[scale.status]}
                  </span>
                </div>

                <h3 className="mt-2 font-serif text-lg text-slate-50">{scale.scaleGroup.title}</h3>
                {scale.scaleGroup.kinitName && (
                  <p className="mt-1 text-sm text-slate-500">{scale.scaleGroup.kinitName}</p>
                )}

                <ChecklistDots scale={scale} />

                <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-amber-300">
                  {locked && <LockIcon />}
                  {ctaLabel(scale)}
                </div>
              </button>
            </motion.div>
          );
        })}
      </motion.div>

      <ProOverrideConfirmModal
        isOpen={pendingOverride !== null}
        targetCode={pendingOverride?.scaleGroup.code ?? ""}
        isConfirming={confirming}
        onConfirm={handleConfirmOverride}
        onCancel={() => setPendingOverride(null)}
      />
    </>
  );
}
