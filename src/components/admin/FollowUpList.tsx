import Link from "next/link";
import type { FollowUp, FollowUpPerson } from "@/lib/adminFollowUps";
import { REMINDER_KINDS } from "@/lib/followUpReminders";
import { bulkReminderQuestion } from "@/lib/followUpRules";
import { RemindButton } from "@/components/admin/RemindButton";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";
import { sendAllFollowUpRemindersAction } from "@/app/(dashboard)/admin/followup-actions";
import { ChevronRight } from "@/components/ui/appIcons";

/** Rows shown per reason before "Show N more" (DESIGN.md, Hierarchy rule 9: show a few, fold the rest). */
const FIRST = 3;

/**
 * People who need a nudge (overdue bills, not practicing, trial ending, credits expiring, Discord not linked), each with a one-tap
 * reminder and "Remind all N" per reason. Lives behind the Follow up button on the Overview (`OverviewMenus`, 2026-11-10, the owner:
 * one button that drops down every follow up; People > Accounts no longer lists them).
 *
 * Laid out for scanning (2026-11-10): each reason is its own group with its count, and each person is a row (name on the left, the
 * reminder on the right). Three rows show; "Show N more" opens the whole list right here. Each heading opens the list it is about,
 * already filtered. A bill someone else pays names that payer, since the reminder goes to them.
 */
export function FollowUpList({ followUps, className }: { followUps: FollowUp[]; className?: string }) {
  if (followUps.length === 0) return null;
  return (
    <section aria-label="Follow up" className={className}>
      <div className="space-y-4">
        {followUps.map((f) => {
          const canRemind = (REMINDER_KINDS as string[]).includes(f.key);
          const row = (p: FollowUpPerson) => (
            <li key={p.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
              <Link
                href={`/admin/users/${p.id}`}
                className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-body font-medium text-slate-100 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate">{p.name}</span>
                  {p.payer && <span className="block truncate text-small font-normal text-slate-500">Paid by {p.payer.name}</span>}
                </span>
                <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
              </Link>
              {canRemind && <RemindButton kind={f.key} userId={p.id} name={p.payer?.name ?? p.name} />}
            </li>
          );
          // Everyone the list carries opens in place; only past that cap does the full list page take over.
          const all = [...f.people, ...f.more];
          const first = all.slice(0, FIRST);
          const rest = all.slice(FIRST);
          const unseen = f.total - all.length;
          return (
            <div key={f.key} className="overflow-hidden rounded-card bg-neu-base shadow-raised-low">
              <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
                <span className="flex items-center gap-1.5">
                  <Link href={f.href} className="rounded-sm text-small font-semibold uppercase tracking-caps text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {f.title}
                  </Link>
                </span>
                <span className="min-w-7 rounded-full bg-slate-50/8 px-2 py-0.5 text-center text-small font-semibold tabular-nums text-slate-100">{f.total}</span>
              </div>
              {all.length > 0 && (
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
                  {canRemind && f.total > 1 && (
                    <li className="flex justify-end px-4 py-2.5">
                      <BulkConfirmButton
                        label={`Remind all ${f.total}`}
                        question={bulkReminderQuestion(f.key, f.total, f.title)}
                        confirmLabel="Yes, remind them"
                        onConfirm={sendAllFollowUpRemindersAction.bind(null, f.key)}
                      />
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
