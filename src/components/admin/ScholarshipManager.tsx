"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { createScholarshipAction, revokeScholarshipAction } from "@/app/(dashboard)/admin/scholarships/actions";

export interface ScholarshipRow {
  id: string;
  code: string;
  email: string;
  classes: string;
  note: string | null;
  status: "available" | "claimed" | "expired" | "revoked";
  expiresAt: string | null;
  claimedAt: string | null;
  claimedBy: string | null;
  createdAt: string;
}

const STATUS_LABEL = { available: "Unclaimed", claimed: "Claimed", expired: "Expired", revoked: "Revoked" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const field = "h-11 w-full rounded-lg bg-neu-base px-3 text-body text-slate-50 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ScholarshipManager({ rows }: { rows: ScholarshipRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [classes, setClasses] = useState("4");
  const [note, setNote] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [fresh, setFresh] = useState<{ code: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createScholarshipAction({ email, classes: Number(classes), note, expiresOn });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFresh({ code: res.code, email });
      setEmail("");
      setNote("");
      router.refresh();
    });
  }

  function revoke(id: string) {
    start(async () => {
      const res = await revokeScholarshipAction(id);
      setConfirmRevoke(null);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="glass-surface space-y-4 p-6">
        <h2 className="text-title font-semibold text-slate-50">New scholarship code</h2>
        <p className="text-small text-slate-400">A 16 digit code for one email address. It adds class credits to that account and can be claimed once, only by someone signed in with that email.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-small text-slate-300">Student email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} autoComplete="off" />
          </label>
          <label className="block text-small text-slate-300">Free classes
            <input type="number" required min={1} max={48} step={1} value={classes} onChange={(e) => setClasses(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="block text-small text-slate-300">Note (only you see it)
            <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="block text-small text-slate-300">Last day to claim (optional)
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={`${field} mt-1`} />
          </label>
        </div>
        {error && <p className="text-small text-red-400">{error}</p>}
        <button type="submit" disabled={pending} className={buttonVariants({ variant: "primary", className: "text-black" })}>{pending ? "Making…" : "Make code"}</button>
        {fresh && (
          <div className="rounded-xl bg-signal/16 p-4">
            <p className="text-small text-slate-300">Code for {fresh.email}. Send it to them; it is also in the list below.</p>
            <p className="mt-1 font-mono text-title tracking-wider text-slate-50">{fresh.code}</p>
            <button type="button" onClick={() => navigator.clipboard.writeText(fresh.code.replace(/\s/g, "")).then(() => toast.success("Copied"))} className={buttonVariants({ variant: "ghost", size: "sm", className: "mt-2" })}>Copy</button>
          </div>
        )}
      </form>

      <div className="glass-surface p-6">
        <h2 className="text-title font-semibold text-slate-50">All codes</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-small text-slate-400">No codes yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-50/10">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-body text-slate-50">{r.code}</p>
                  <p className="truncate text-small text-slate-400">
                    {r.email} · {r.classes}{r.note ? ` · ${r.note}` : ""}
                  </p>
                  <p className="text-caption text-slate-500">
                    {STATUS_LABEL[r.status]}
                    {r.status === "claimed" && r.claimedAt ? ` ${day(r.claimedAt)}${r.claimedBy ? ` by ${r.claimedBy}` : ""}` : ""}
                    {r.status === "available" && r.expiresAt ? ` · claim by ${day(r.expiresAt)}` : ""}
                  </p>
                </div>
                {r.status === "available" &&
                  (confirmRevoke === r.id ? (
                    <span className="flex gap-2">
                      <button type="button" disabled={pending} onClick={() => revoke(r.id)} className="tap rounded-full bg-red-500 px-3 py-1.5 text-small font-medium text-white">Revoke</button>
                      <button type="button" onClick={() => setConfirmRevoke(null)} className="tap px-3 py-1.5 text-small text-slate-300">Keep</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmRevoke(r.id)} className="tap px-3 py-1.5 text-small text-red-400">Revoke</button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
