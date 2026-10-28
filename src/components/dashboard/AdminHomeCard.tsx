import Link from "next/link";
import { Card, Eyebrow } from "@/components/ui/Card";
import type { AdminHomeRow } from "@/lib/adminHome";

/** The admin's Home card: today's classes and what is waiting, one tap each. Students never get this card. */
export function AdminHomeCard({ rows }: { rows: AdminHomeRow[] }) {
  return (
    <Card className="relative z-(--z-mid)">
      <Eyebrow>Today</Eyebrow>
      <ul className="mt-3 grid gap-1">
        {rows.map((row) => (
          <li key={row.href}>
            <Link href={row.href} className="tap flex items-center justify-between gap-3 rounded-control py-2 text-small text-slate-100 hover:bg-slate-800/40">
              <span>{row.label}</span>
              <span className="rounded-full bg-neu-base px-2.5 py-0.5 text-small font-semibold tabular-nums text-signal-fg shadow-raised-low">{row.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
