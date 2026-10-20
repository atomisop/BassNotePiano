import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * #4, Empty state.
 *
 * The design-system rule this enforces: an empty screen must say what the user
 * can do next, never just "No data". So `action` is part of the API rather
 * than an optional flourish, and `title` is phrased as a situation, not an
 * error.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card bg-neu-base px-6 py-12 text-center shadow-raised-low",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.08)] text-slate-200 shadow-plane-mid">
          {icon}
        </div>
      )}
      <h3 className="text-body font-semibold text-slate-50">{title}</h3>
      {description && <p className="mt-1.5 max-w-[42ch] text-small text-slate-400">{description}</p>}

      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className={cn(buttonVariants(), "mt-6")}
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={cn(buttonVariants(), "mt-6")}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
