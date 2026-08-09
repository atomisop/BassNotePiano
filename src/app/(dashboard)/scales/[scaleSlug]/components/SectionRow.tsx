"use client";

import { motion } from "framer-motion";

export const sectionRowVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

type SectionStatus = "completed" | "ready" | "locked" | "coming-soon";

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="m22 8-5 4 5 4V8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 2-2 3.5M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12l5 5L19 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

const ICONS: Record<string, () => React.JSX.Element> = { VIDEO: VideoIcon, PDF: PdfIcon, QUIZ: QuizIcon };

export function SectionRow({
  icon,
  title,
  duration,
  required,
  status,
  lockedReason,
  scoreLabel,
  onClick,
}: {
  icon: "VIDEO" | "PDF" | "QUIZ";
  title: string;
  duration?: string;
  required: boolean;
  status: SectionStatus;
  lockedReason?: string;
  scoreLabel?: string;
  onClick?: () => void;
}) {
  const Icon = ICONS[icon];
  const interactive = Boolean(onClick);
  const dimmed = status === "locked" || status === "coming-soon";

  return (
    <motion.div
      variants={sectionRowVariants}
      className={`glass-surface flex items-center gap-4 p-4 transition ${dimmed ? "opacity-50" : ""} ${
        interactive ? "cursor-pointer hover:border-amber-400/30" : dimmed ? "cursor-not-allowed" : ""
      }`}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : dimmed ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          status === "completed" ? "bg-emerald-400 text-slate-950" : "border border-ink/10 text-slate-400"
        }`}
      >
        {status === "completed" ? <CheckIcon /> : status === "locked" ? <LockIcon /> : status === "ready" ? <PlayIcon /> : <Icon />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-slate-100">{title}</p>
          {required && status !== "coming-soon" && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Required
            </span>
          )}
        </div>
        {status === "locked" && lockedReason ? (
          <p className="mt-0.5 text-xs text-slate-600">{lockedReason}</p>
        ) : status === "coming-soon" ? (
          <p className="mt-0.5 text-xs text-slate-600">Content for this section is on its way.</p>
        ) : duration ? (
          <p className="mt-0.5 text-xs text-slate-600">{duration}</p>
        ) : null}
      </div>

      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
          status === "completed"
            ? "bg-emerald-400/15 text-emerald-300"
            : status === "locked"
              ? "bg-slate-800 text-slate-500"
              : status === "coming-soon"
                ? "bg-slate-800 text-slate-500"
                : "bg-amber-400/15 text-amber-300"
        }`}
      >
        {status === "completed" ? (scoreLabel ?? "Completed") : status === "locked" ? "Locked" : status === "coming-soon" ? "Coming soon" : "Start"}
      </span>
    </motion.div>
  );
}
