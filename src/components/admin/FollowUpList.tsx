import Link from "next/link";
import type { FollowUp } from "@/lib/adminFollowUps";
import { REMINDER_KINDS } from "@/lib/followUpReminders";
import { FollowUpPeople } from "@/components/admin/FollowUpPeople";
import { Hint } from "@/components/ui/Hint";
import { HomeRows } from "@/components/home/HomeRow";

/**
 * People who need a nudge (overdue bills, not practicing, trial ending, credits expiring, stale applications), each with a one-tap
 * reminder, "Remind all" per reason, and the whole list opening in place. Each heading opens the list it is about, already filtered.
 * Lives on People > Accounts (moved off the Overview 2026-10-30: it is about people, not about how the studio is doing).
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
            <FollowUpPeople
              followUp={{ key: f.key, title: f.title, total: f.total, people: f.people, more: f.more }}
              remindable={(REMINDER_KINDS as string[]).includes(f.key)}
            />
          )}
        </li>
      ))}
    </HomeRows>
  );
}
