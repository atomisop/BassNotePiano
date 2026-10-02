import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, Cross2Icon, ExclamationTriangleIcon, LockClosedIcon } from "@radix-ui/react-icons";

/**
 * Status chips. Status is information, not an action, so none of these use
 * the signal green (STEP 2C, rule 2). Each tone pairs an icon with text, so
 * status never relies on color alone:
 * - neutral: plain label
 * - success: check icon, paper text
 * - warning: triangle icon, paper text
 * - danger: cross icon, red text
 * - locked: lock icon, gray
 */
type Tone = "neutral" | "success" | "warning" | "danger" | "locked";

const ICONS: Record<Tone, ReactNode> = {
  neutral: null,
  success: <CheckIcon aria-hidden className="h-3.5 w-3.5" />,
  warning: <ExclamationTriangleIcon aria-hidden className="h-3.5 w-3.5" />,
  danger: <Cross2Icon aria-hidden className="h-3.5 w-3.5" />,
  locked: <LockClosedIcon aria-hidden className="h-3.5 w-3.5" />,
};

const TONES: Record<Tone, string> = {
  neutral: "border-ink/10 bg-[rgb(var(--c-s-50)/0.05)] text-slate-200",
  success: "border-ink/15 bg-[rgb(var(--c-s-50)/0.08)] text-slate-50",
  warning: "border-ink/20 bg-[rgb(var(--c-s-50)/0.06)] text-slate-50",
  danger: "border-[rgb(var(--c-rd-400)/0.4)] bg-[rgb(var(--c-rd-400)/0.1)] text-[rgb(var(--c-rd-300))]",
  locked: "border-ink/10 bg-transparent text-slate-500",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-small font-medium",
        TONES[tone],
        className,
      )}
    >
      {ICONS[tone]}
      {children}
    </span>
  );
}
