import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { findMoneyIssues } from "@/lib/moneyCheck";
import { MoneyIssueCard } from "@/components/admin/MoneyIssueCard";
import { applyMoneyFixAction } from "./actions";
import { Hint } from "@/components/ui/Hint";

export const metadata = { title: "Admin: Money check" };

export default async function AdminMoneyCheckPage() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 className="sr-only">Money check<Hint className="ml-1.5">Only the owner can use the money check.</Hint></h1>
      </div>
    );
  }
  const issues = await findMoneyIssues();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="sr-only">Money check</h1>
      {/* The result is the hero: how many things do not add up. The explanation is one quiet paragraph under it. */}
      <p className={`text-headline font-semibold tabular-nums ${issues.length === 0 ? "text-slate-50" : "text-amber-300"}`}>
        {issues.length === 0 ? "Everything adds up" : `${issues.length} ${issues.length === 1 ? "thing does" : "things do"} not add up`}
      </p>
      <p className="mt-2 max-w-[70ch] text-small text-slate-500">
        Looks over every running plan and open bill and lists what does not add up. Each problem has one button. Nothing changes until you press it, and the student is not
        told. For anything else, use <Link href="/admin/payments" className="underline underline-offset-2 hover:text-slate-300">Payments</Link> (undo a refund, cancel a bill, delete) or the student&apos;s page (Plan progress).
      </p>
      {issues.length === 0 ? (
        <p className="mt-6 text-small text-slate-400">Nothing to fix.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {issues.map((issue) => (
            <li key={issue.key}>
              <MoneyIssueCard issue={issue} onFix={applyMoneyFixAction} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
