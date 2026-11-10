import Link from "next/link";
import type { FollowUp } from "@/lib/adminFollowUps";
import { REMINDER_KINDS } from "@/lib/followUpReminders";
import { RemindButton } from "@/components/admin/RemindButton";
import { Hint } from "@/components/ui/Hint";
import { ChevronRight } from "@/components/ui/appIcons";

/** Rows shown per reason before "Show N more" (DESIGN.md, Hierarchy rule 9: show a few, fold the rest). */
const FIRST = 3;

/**
 * People who need a nudge (overdue bills, not practicing, trial ending, credits expiring, Discord not linked), each with a one-tap
 * reminder. Lives on People > Accounts (moved off the Overview 2026-10-30: it is about people, not about how the studio is doing).
 *
 * Laid out for scanning (2026-11-10): each reason is its own group with its count, and each person is a row (name on the left, the
 * reminder on the right), instead of names and "Remind" links wrapping together into one block of equal-looking text.
 */
export function FollowUpList({ followUps, className }: { followUps: FollowUp[]; className?: string }) {
  if (followUps.length === 0) return null;
  const people = followUps.reduce((n, f) => n + f.total, 0);
  return (
    <section aria-label="Follow up" className={className}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-title font-semibold text-slate-50">Follow up</h2>
        <span className="text-small text-slate-500">
          {people} {people === 1 ? "person" : "people"}
        </span>
      </div>
      <div className="mt-3 space-y-4">
        {followUps.map((f) => {
          const canRemind = (REMINDER_KINDS as string[]).includes(f.key);
          const row = (p: { id: string; name: string }) => (
            <li key={p.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
              <Link
                href={`/admin/users/${p.id}`}
                className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-body font-medium text-slate-100 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{p.name}</span>
                <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
              </Link>
              {canRemind && <RemindButton kind={f.key} userId={p.id} name={p.name} />}
            </li>
          );
          const first = f.people.slice(0, FIRST);
          const rest = f.people.slice(FIRST);
          const unseen = f.total - f.people.length;
          return (
            <div key={f.key} className="overflow-hidden rounded-card bg-slate-50/4 ring-1 ring-inset ring-slate-50/8">
              <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
                <span className="flex items-center gap-1.5">
                  <Link href={f.href} className="rounded-sm text-small font-semibold uppercase tracking-caps text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {f.title}
                  </Link>
                  <Hint>{f.hint}</Hint>
                </span>
                <span className="min-w-7 rounded-full bg-slate-50/8 px-2 py-0.5 text-center text-small font-semibold tabular-nums text-slate-100">{f.total}</span>
              </div>
              {f.people.length > 0 && (
                <ul className="divide-y divide-slate-50/6 border-t border-slate-50/6">
                  {first.map(row)}
                  {rest.length > 0 && (
                    <li>
                      <details className="group/more">
                        <summary className="tap flex cursor-pointer list-none items-center px-4 py-2.5 text-small font-medium text-slate-400 hover:text-slate-200 group-open/more:hidden [&::-webkit-details-marker]:hidden">
                          Show {rest.length} more
                        </summary>
                        <ul className="divide-y divide-slate-50/6">{rest.map(row)}</ul>
                      </details>
                    </li>
                  )}
                  {unseen > 0 && (
                    <li className="px-4 py-2.5">
                      <Link href={f.href} className="tap inline-flex items-center text-small font-medium text-slate-400 hover:text-slate-200">
                        And {unseen} more on the full list
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
