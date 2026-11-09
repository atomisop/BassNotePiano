import Link from "next/link";
import type { FollowUp } from "@/lib/adminFollowUps";
import { REMINDER_KINDS } from "@/lib/followUpReminders";
import { RemindButton } from "@/components/admin/RemindButton";
import { Hint } from "@/components/ui/Hint";
import { HomeRows } from "@/components/home/HomeRow";

/**
 * People who need a nudge (overdue bills, not practicing, trial ending, credits expiring, stale applications), each with a one-tap
 * reminder. Lives on People > Accounts (moved off the Overview 2026-10-30: it is about people, not about how the studio is doing).
 */
export function FollowUpList({ followUps, className }: { followUps: FollowUp[]; className?: string }) {
  if (followUps.length === 0) return null;
  const people = followUps.reduce((n, f) => n + f.total, 0);
  return (
    <HomeRows title="Follow up" aside={`${people} ${people === 1 ? "person" : "people"}`} className={className}>
      {followUps.map((f) => (
        <li key={f.key} className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Link href={f.href} className="text-body font-semibold text-slate-50 hover:underline">
                {f.title}
              </Link>
              <Hint>{f.hint}</Hint>
            </span>
            <span className="text-small tabular-nums text-slate-400">{f.total}</span>
          </div>
          {f.people.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-small">
              {f.people.map((p) => (
                <span key={p.id} className="inline-flex flex-wrap items-center gap-2">
                  <Link href={`/admin/users/${p.id}`} className="tap inline-flex items-center text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-slate-50">
                    {p.name}
                  </Link>
                  {(REMINDER_KINDS as string[]).includes(f.key) && <RemindButton kind={f.key} userId={p.id} name={p.name} />}
                </span>
              ))}
              {f.total > f.people.length && <span className="text-slate-500">and {f.total - f.people.length} more</span>}
            </p>
          )}
        </li>
      ))}
    </HomeRows>
  );
}
