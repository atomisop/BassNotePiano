"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The inline version of ErrorScreen: for one region of a page that stopped
 * updating or failed to load, where blowing away the whole screen would be
 * wrong. Says what broke in plain words and always offers the way out.
 */
export function RegionError({
  title = "Couldn't refresh this.",
  detail = "Check your connection. We'll keep trying, or you can try now.",
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-wrap items-center justify-between gap-3 rounded-control bg-neu-base px-4 py-3 shadow-pressed-low", className)}
    >
      <div className="min-w-0">
        <p className="text-small font-semibold text-slate-50">{title}</p>
        <p className="text-small text-slate-400">{detail}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
