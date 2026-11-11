import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * An empty list on an admin screen: the icon, what is (not) here, and one quiet sentence in plain words. The sentence is shown, never
 * folded behind an "i": a lone info icon under the title of an empty box says nothing.
 */
export function AdminEmptyState({ icon, title, description, className }: { icon?: ReactNode; title: string; description?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-card border border-dashed border-slate-50/12 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-signal/14 text-signal-fg [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <p className="text-title font-semibold text-slate-50">{title}</p>
      {description && <p className="mt-1.5 max-w-[42ch] text-small text-slate-400">{description}</p>}
    </div>
  );
}
