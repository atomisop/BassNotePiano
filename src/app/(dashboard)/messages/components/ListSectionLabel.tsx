import type { ReactNode } from "react";

/** Names one group of rows in the list (Pinned, Direct messages, Groups), so a long list reads as a few short ones. */
export function ListSectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between px-4 pt-3">
      <p className="text-small font-medium text-slate-400">{children}</p>
      {action}
    </div>
  );
}
