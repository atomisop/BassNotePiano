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
  neutral: "text-slate-200",
  success: "text-slate-50",
  warning: "text-slate-50",
  danger: "text-[rgb(var(--c-rd-300))]",
  locked: "text-slate-400",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-neu-base px-2.5 py-0.5 text-small font-medium shadow-pressed-low",
        TONES[tone],
        className,
      )}
    >
      {ICONS[tone]}
      {children}
    </span>
  );
}
