"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import {
  createScholarshipAction,
  lookupScholarshipAccountAction,
  regenerateScholarshipAction,
  revokeScholarshipAction,
  updateScholarshipAction,
} from "@/app/(dashboard)/admin/scholarships/actions";

export interface ScholarshipRow {
  id: string;
  code: string;
  email: string;
  classes: number;
  classesLabel: string;
  note: string | null;
  status: "available" | "claimed" | "expired" | "revoked";
  expiresAt: string | null;
  claimedAt: string | null;
  claimedBy: string | null;
  createdAt: string;
}

type Filter = "all" | ScholarshipRow["status"];
const STATUS_LABEL = { available: "Unclaimed", claimed: "Used", expired: "Expired", revoked: "Revoked" } as const;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "available", label: "Unclaimed" },
  { id: "claimed", label: "Used" },
  { id: "expired", label: "Expired" },
  { id: "revoked", label: "Revoked" },
];
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const dateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "");
const field = "h-11 w-full rounded-lg bg-neu-base px-3 text-body text-slate-50 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring";
const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 16);
const groups = (d: string) => d.replace(/(\d{4})(?=\d)/g, "$1 ");

function randomDigits(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(bytes, (n) => String(n % 10)).join("");
}

type Lookup = { state: "idle" } | { state: "checking" } | { state: "found"; name: string | null; email: string; verified: boolean } | { state: "missing" };

export function ScholarshipManager({ rows }: { rows: ScholarshipRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [classes, setClasses] = useState("4");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [fresh, setFresh] = useState<{ code: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ classes: "", note: "", expiresOn: "" });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // Looks the typed email up after a short pause, so the owner sees at once whether that student has an account.
  useEffect(() => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setLookup({ state: "idle" });
      return;
    }
    setLookup({ state: "checking" });
    let alive = true;
    const t = setTimeout(async () => {
      const res = await lookupScholarshipAccountAction(value);
      if (!alive) return;
      if (!res.ok) return setLookup({ state: "idle" });
      setLookup("found" in res && res.found === false ? { state: "missing" } : { state: "found", name: (res as { name: string | null }).name, email: (res as { email: string }).email, verified: (res as { verified: boolean }).verified });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [email]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, available: 0, claimed: 0, expired: 0, revoked: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  const visible = rows.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || r.email.toLowerCase().includes(q) || r.code.replace(/\s/g, "").includes(q.replace(/\s/g, "")) || (r.claimedBy ?? "").toLowerCase().includes(q);
  });

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createScholarshipAction({ email, classes: Number(classes), code, note, expiresOn });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFresh({ code: res.code, email });
      setEmail("");
      setCode("");
      setNote("");
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function startEdit(r: ScholarshipRow) {
    setEditing(r.id);
    setEdit({ classes: String(r.classes), note: r.note ?? "", expiresOn: dateInput(r.expiresAt) });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="glass-surface space-y-4 p-6">
        <h2 className="text-title font-semibold text-slate-50">New scholarship code</h2>
        <p className="text-small text-slate-400">For a student who already has an account. The code adds free classes to that account, can be used once, and only works while they are signed in with that email.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-small text-slate-300" htmlFor="sch-email">Student email</label>
            <input id="sch-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} autoComplete="off" />
            <p className="mt-1 min-h-5 text-small" aria-live="polite">
              {lookup.state === "checking" && <span className="text-slate-400">Checking…</span>}
              {lookup.state === "found" && <span className="text-slate-50">Account found: {lookup.name ?? lookup.email}{lookup.verified ? "" : " (email not verified yet, they must verify before claiming)"}</span>}
              {lookup.state === "missing" && <span className="text-red-400">No student account has this email.</span>}
            </p>
          </div>
          <div>
            <label className="block text-small text-slate-300" htmlFor="sch-classes">Free classes (1 to 48)</label>
            <input id="sch-classes" type="number" required min={1} max={48} step={1} value={classes} onChange={(e) => setClasses(e.target.value)} className={`${field} mt-1`} />
          </div>
          <div>
            <label className="block text-small text-slate-300" htmlFor="sch-code">16 digit code</label>
            <div className="mt-1 flex gap-2">
              <input id="sch-code" inputMode="numeric" placeholder="Blank = random" value={groups(code)} onChange={(e) => setCode(digitsOnly(e.target.value))} className={`${field} font-mono tracking-wider`} autoComplete="off" />
              <button type="button" onClick={() => setCode(randomDigits())} className={buttonVariants({ variant: "secondary", className: "shrink-0" })}>Generate</button>
            </div>
          </div>
          <div>
            <label className="block text-small text-slate-300" htmlFor="sch-expiry">Last day to claim (optional)</label>
            <input id="sch-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={`${field} mt-1`} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-small text-slate-300" htmlFor="sch-note">Note (only you see it)</label>
            <input id="sch-note" type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1`} />
          </div>
        </div>
        {error && <p role="alert" className="text-small text-red-400">{error}</p>}
        <button type="submit" disabled={pending || lookup.state === "missing"} className={buttonVariants({ variant: "primary", className: "text-black" })}>{pending ? "Making…" : "Make code"}</button>
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
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={`tap rounded-full px-3 py-1.5 text-small ${filter === f.id ? "bg-signal text-black font-medium" : "text-slate-300 bg-slate-50/8"}`}>
              {f.label} {counts[f.id]}
            </button>
          ))}
        </div>
        <label htmlFor="sch-search" className="sr-only">Search codes</label>
        <input id="sch-search" placeholder="Search email, code or name" value={query} onChange={(e) => setQuery(e.target.value)} className={`${field} mt-3`} />
        {visible.length === 0 ? (
          <p className="mt-3 text-small text-slate-400">{rows.length === 0 ? "No codes yet." : "Nothing matches."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-50/10">
            {visible.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-body text-slate-50">{r.code}</p>
                    <p className="truncate text-small text-slate-400">{r.email} · {r.classesLabel}{r.note ? ` · ${r.note}` : ""}</p>
                    <p className="text-caption text-slate-500">
                      {STATUS_LABEL[r.status]}
                      {r.status === "claimed" && r.claimedAt ? ` ${day(r.claimedAt)}${r.claimedBy ? ` by ${r.claimedBy}` : ""}` : ""}
                      {r.status === "available" && r.expiresAt ? ` · claim by ${day(r.expiresAt)}` : ""}
                      {r.status !== "claimed" ? ` · made ${day(r.createdAt)}` : ""}
                    </p>
                  </div>
                  {r.status === "available" && (
                    <span className="flex flex-wrap items-center gap-1">
                      <button type="button" onClick={() => (editing === r.id ? setEditing(null) : startEdit(r))} className="tap px-3 py-1.5 text-small text-slate-300">Edit</button>
                      <button type="button" disabled={pending} onClick={() => run(async () => { const res = await regenerateScholarshipAction(r.id); if (res.ok) toast.success(`New code ${res.code}`); return res; })} className="tap px-3 py-1.5 text-small text-slate-300">New digits</button>
                      {confirmRevoke === r.id ? (
                        <>
                          <button type="button" disabled={pending} onClick={() => run(() => revokeScholarshipAction(r.id), () => setConfirmRevoke(null))} className="tap rounded-full bg-red-500 px-3 py-1.5 text-small font-medium text-white">Revoke</button>
                          <button type="button" onClick={() => setConfirmRevoke(null)} className="tap px-3 py-1.5 text-small text-slate-300">Keep</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmRevoke(r.id)} className="tap px-3 py-1.5 text-small text-red-400">Revoke</button>
                      )}
                    </span>
                  )}
                </div>
                {editing === r.id && r.status === "available" && (
                  <div className="mt-3 grid gap-3 rounded-xl bg-slate-50/5 p-4 md:grid-cols-3">
                    <label className="block text-small text-slate-300">Free classes
                      <input type="number" min={1} max={48} step={1} value={edit.classes} onChange={(e) => setEdit({ ...edit, classes: e.target.value })} className={`${field} mt-1`} />
                    </label>
                    <label className="block text-small text-slate-300">Last day to claim
                      <input type="date" value={edit.expiresOn} onChange={(e) => setEdit({ ...edit, expiresOn: e.target.value })} className={`${field} mt-1`} />
                    </label>
                    <label className="block text-small text-slate-300">Note
                      <input type="text" maxLength={200} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} className={`${field} mt-1`} />
                    </label>
                    <div className="flex gap-2 md:col-span-3">
                      <button type="button" disabled={pending} onClick={() => run(() => updateScholarshipAction(r.id, { classes: Number(edit.classes), note: edit.note, expiresOn: edit.expiresOn }), () => setEditing(null))} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>Save</button>
                      <button type="button" onClick={() => setEditing(null)} className={buttonVariants({ variant: "ghost", size: "sm" })}>Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
