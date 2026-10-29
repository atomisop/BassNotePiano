import Link from "next/link";
import type { DueWeek } from "@/lib/adminDue";
import { Hint } from "@/components/ui/Hint";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * "Payments due, next 7 days": a seven-bar week chart (one bar per Eastern day, taller for more money due, today in orange), then the
 * same bills grouped by day with who owes what, and anyone already past due underneath. It says what it counts, so nothing is a mystery:
 * subscribers on a payment plan whose next 28-day bill falls in the window.
 */
export function DueThisWeek({ week }: { week: DueWeek }) {
  const max = Math.max(1, ...week.days.map((d) => d.cents));
  const byDay = week.days.filter((d) => d.count > 0);

  return (
    <section aria-label="Payments due in the next 7 days" className="rounded-2xl bg-neu-base shadow-raised-mid p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1 text-title font-semibold text-slate-50">
          Due in 7 days
          <Hint label="What this counts">Subscribers whose next 28-day bill lands in the next week. Days are Eastern.</Hint>
        </h2>
        <p className="text-small tabular-nums text-slate-400">
          {week.items.length === 0 ? "Nothing due" : `${usd(week.totalCents)} · ${week.items.length} ${week.items.length === 1 ? "bill" : "bills"}`}
        </p>
      </div>

      <div className={week.items.length === 0 ? "hidden" : "mt-4 grid grid-cols-7 gap-2"} role="img" aria-label={`Bills due per day: ${week.days.map((d) => `${d.weekday} ${d.count}`).join(", ")}`}>
        {week.days.map((d) => (
          <div key={d.key} className="flex flex-col items-center gap-1.5">
            <span className="h-4 text-caption font-semibold tabular-nums text-slate-300">{d.count > 0 ? d.count : ""}</span>
            <div className="flex h-20 w-full items-end justify-center">
              <div
                className={`w-full max-w-7 rounded-lg ${d.count === 0 ? "bg-slate-50/8" : d.isToday ? "bg-signal" : "bg-slate-50/85"}`}
                style={{ height: d.count === 0 ? 6 : `${Math.max(14, Math.round((d.cents / max) * 100))}%` }}
              />
            </div>
            <span className={`text-caption ${d.isToday ? "font-semibold text-signal-fg" : "text-slate-500"}`}>{d.isToday ? "Today" : d.weekday}</span>
            <span className="text-caption tabular-nums text-slate-500">{d.dayOfMonth}</span>
          </div>
        ))}
      </div>

      {byDay.length > 0 && (
        <ul className="mt-4 space-y-3">
          {byDay.map((d) => (
            <li key={d.key}>
              <p className="mb-1 text-small font-medium text-slate-400">
                {d.isToday ? "Today" : d.weekday}, {d.dayOfMonth} · {usd(d.cents)}
              </p>
              <ul className="divide-y divide-(--neu-edge) rounded-xl bg-slate-50/3 px-3">
                {week.items
                  .filter((i) => i.dayKey === d.key)
                  .map((i) => (
                    <li key={i.userId}>
                      <Link href={`/admin/users/${i.userId}`} className="tap flex items-center gap-3 py-2 text-small hover:opacity-80">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50/10 text-caption font-semibold text-slate-200">{i.name.charAt(0).toUpperCase()}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-100">{i.name}</span>
                        <span className="tabular-nums text-slate-300">{usd(i.amountCents)}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {week.overdue.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 flex items-center justify-between text-small font-medium text-slate-400">
            <span>Already late</span>
            <span className="tabular-nums">{usd(week.overdueCents)}</span>
          </p>
          <ul className="divide-y divide-(--neu-edge) rounded-xl bg-slate-50/3 px-3">
            {week.overdue.map((o) => (
              <li key={o.userId}>
                <Link href={`/admin/users/${o.userId}`} className="tap flex items-center gap-3 py-2 text-small hover:opacity-80">
                  <span className="min-w-0 flex-1 truncate text-slate-100">{o.name}</span>
                  <span className="rounded-full bg-signal/16 px-2 py-0.5 text-caption font-semibold text-signal-fg">{o.daysLate}d late</span>
                  <span className="tabular-nums text-slate-300">{usd(o.amountCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
