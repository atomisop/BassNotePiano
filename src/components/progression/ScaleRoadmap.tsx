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
  LOCKED: "bg-neutral-700",
  AVAILABLE: "bg-neutral-500",
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
          <span className={`h-1.5 w-1.5 rounded-full ${item.done ? "bg-amber-400" : "bg-neutral-700"}`} />
          <span className={`text-[11px] ${item.done ? "text-neutral-300" : "text-neutral-600"}`}>{item.label}</span>
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

function ctaLabel(scale: ScaleAccessState): string {
  if (scale.requiresOverrideConfirm) return "Unlock ahead";
  if (scale.reason === "requires-payment") return "Unlock — $25";
  if (scale.reason === "locked") return "Complete previous scales first";
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
    if (scale.reason === "requires-payment") {
      router.push(`/billing/unlock/${scale.scaleGroup.slug}`);
      return;
    }
    // reason === "locked" — no route to send them to, card is inert.
  }

  async function handleConfirmOverride() {
    if (!pendingOverride) return;
    setConfirming(true);
    // Middleware gates /scales/[slug] off the JWT, not the DB — and that
    // token can still say isProMember: false if it was minted before Pro
    // access was granted. Without this refresh, the ?override=confirmed
    // request middleware sees is built on stale claims, so it bounces the
    // navigation straight back here — looking like "Confirm" did nothing.
    await update();
    router.push(`/scales/${pendingOverride.scaleGroup.slug}?override=confirmed`);
    setConfirming(false);
    setPendingOverride(null);
  }

  return (
    <>
      <motion.div
        variants={gridContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {roadmap.map((scale) => {
          const disabled = !scale.canAccess && scale.reason === "locked";
          return (
            <motion.button
              key={scale.scaleGroup.slug}
              type="button"
              variants={gridItem}
              whileHover={disabled ? undefined : { y: -4 }}
              onClick={() => handleCardClick(scale)}
              disabled={disabled}
              className={`group rounded-2xl border p-5 text-left transition ${
                disabled
                  ? "cursor-not-allowed border-neutral-900 bg-neutral-900/30 opacity-60"
                  : "border-neutral-800 bg-neutral-900/60 hover:border-amber-400/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
                  {scale.scaleGroup.code}
                </p>
                <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[scale.status]}`} />
                  {STATUS_LABEL[scale.status]}
                </span>
              </div>

              <h3 className="mt-2 font-serif text-lg text-neutral-50">{scale.scaleGroup.title}</h3>
              {scale.scaleGroup.kinitName && (
                <p className="mt-1 text-sm text-neutral-500">{scale.scaleGroup.kinitName}</p>
              )}

              <ChecklistDots scale={scale} />

              <div
                className={`mt-5 flex items-center gap-1.5 text-sm font-medium ${
                  disabled ? "text-neutral-600" : "text-amber-300"
                }`}
              >
                {disabled && <LockIcon />}
                {ctaLabel(scale)}
              </div>
            </motion.button>
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
