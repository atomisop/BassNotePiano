import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * #4 — Empty state.
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
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--c-a-400)/0.1)] text-[rgb(var(--c-a-300))]">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-lg text-slate-50">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>

      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--c-a-400)/0.4)] px-4 py-2 text-sm font-medium text-[rgb(var(--c-a-300))] transition hover:border-[rgb(var(--c-a-400))] hover:bg-[rgb(var(--c-a-400)/0.1)]"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[rgb(var(--c-a-400)/0.4)] px-4 py-2 text-sm font-medium text-[rgb(var(--c-a-300))] transition hover:border-[rgb(var(--c-a-400))] hover:bg-[rgb(var(--c-a-400)/0.1)]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
