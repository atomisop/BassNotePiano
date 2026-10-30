import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, Lock, TriangleAlert, X } from "@/components/ui/appIcons";

/**
 * Status chips. Each tone pairs an icon with text, so status never relies on
 * color alone, and now also carries a pastel wash (the reference look):
 * - neutral: plain label
 * - success: check icon, soft green
 * - warning: triangle icon, soft yellow
 * - danger: cross icon, soft pink
 * - locked: lock icon, gray
 */
type Tone = "neutral" | "success" | "warning" | "danger" | "locked";

const ICONS: Record<Tone, ReactNode> = {
  neutral: null,
  success: <Check aria-hidden className="h-3.5 w-3.5" />,
  warning: <TriangleAlert aria-hidden className="h-3.5 w-3.5" />,
  danger: <X aria-hidden className="h-3.5 w-3.5" />,
  locked: <Lock aria-hidden className="h-3.5 w-3.5" />,
};

const TONES: Record<Tone, string> = {
  neutral: "bg-neu-base text-slate-200 shadow-pressed-low",
  success: "tint-green",
  warning: "tint-yellow",
  danger: "tint-pink",
  locked: "bg-neu-base text-slate-400 shadow-pressed-low",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-small font-medium",
        TONES[tone],
        className,
      )}
    >
      {ICONS[tone]}
      {children}
    </span>
  );
}
