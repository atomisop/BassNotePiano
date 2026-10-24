"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateFamilyBundleTotal,
  calculatePaymentPlanRate,
  describePaymentPlan,
  discountedPlanPriceCents,
  MAX_PERSONAL_DISCOUNT_PERCENT,
  OFFERED_PLAN_CADENCE,
  type PricingConfig,
} from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import type { DiscountCandidate, PricingFormValues } from "@/app/(dashboard)/admin/pricing/actions";

export interface PricingDiscountRow {
  userId: string;
  name: string | null;
  email: string;
  percent: number;
  note: string | null;
  updatedAt: string;
  plan: { monthlyCents: number; listCents: number; cadence: string; term: string } | null;
}

interface Props {
  initial: PricingFormValues;
  discounts: PricingDiscountRow[];
  onSavePricing: (values: PricingFormValues) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSearch: (query: string) => Promise<DiscountCandidate[]>;
  onSetDiscount: (userId: string, percent: number, note: string) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  onClearDiscount: (userId: string) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
}

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const inputClass = "h-11 rounded-lg bg-neu-base px-3 text-base text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

const FIELDS: { key: keyof PricingFormValues; label: string; unit: "$" | "%"; min: number; max: number; help: string }[] = [
  { key: "pricing.monthlyPlanDollars", label: "1 Month plan price", unit: "$", min: 20, max: 2000, help: "Per 28-day payment, before any term discount. Shown as just under the next $5 ($220 shows as $219.99)." },
  { key: "pricing.term3DiscountPercent", label: "3 month plan discount", unit: "%", min: 0, max: 60, help: "Off the 1 month price when someone commits to 3 months (3 payments)." },
  { key: "pricing.term6DiscountPercent", label: "6 month plan discount", unit: "%", min: 0, max: 70, help: "Off the 1 month price when someone commits to 6 months (6 payments)." },
  { key: "pricing.familyDiscountPercent", label: "Family plan extra discount", unit: "%", min: 0, max: 50, help: "Extra off, per person, on a family plan." },
  { key: "pricing.extraClassPriceDollars", label: "Extra class price", unit: "$", min: 1, max: 500, help: "One extra 45 minute class, on top of a weekly class or for someone without a plan." },
];

function toConfig(v: PricingFormValues): PricingConfig {
  return {
    monthlyBaseCents: Math.round(v["pricing.monthlyPlanDollars"] * 100),
    term3DiscountRate: v["pricing.term3DiscountPercent"] / 100,
    term6DiscountRate: v["pricing.term6DiscountPercent"] / 100,
    familyDiscountRate: v["pricing.familyDiscountPercent"] / 100,
    extraClassCents: Math.round(v["pricing.extraClassPriceDollars"] * 100),
  };
}

function Card({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section className="glass-surface p-5">
      <h2 className="text-body font-semibold text-slate-50">{title}</h2>
      {blurb && <p className="mt-1 text-small text-slate-400">{blurb}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PricesCard({ initial, onSave }: { initial: PricingFormValues; onSave: Props["onSavePricing"] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const parsed = useMemo(() => {
    const values: Partial<PricingFormValues> = {};
    let problem: string | null = null;
    for (const f of FIELDS) {
      const n = Number(draft[f.key]);
      if (draft[f.key].trim() === "" || !Number.isInteger(n)) problem = `${f.label}: enter a whole number.`;
      else if (n < f.min || n > f.max) problem = `${f.label}: between ${f.min} and ${f.max}.`;
      (values as Record<string, number>)[f.key] = n;
    }
    return { values: values as PricingFormValues, problem };
  }, [draft]);

  const changed = FIELDS.filter((f) => parsed.values[f.key] !== initial[f.key]);
  const preview = useMemo(() => {
    if (parsed.problem) return null;
    const cfg = toConfig(parsed.values);
    return (["MONTHLY", "TERM_3", "TERM_6"] as const).map((term) => {
      const rate = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, term, cfg);
      const family = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, term, 2, cfg);
      return { term, label: describePaymentPlan(OFFERED_PLAN_CADENCE, term), monthly: rate.installmentAmountCents, months: rate.termMonths, family: family.perStudentMonthlyCents };
    });
  }, [parsed]);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await onSave(parsed.values).catch(() => ({ ok: false as const, error: "That did not go through. Please try again." }));
    setBusy(false);
    setAsking(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error });
    setMessage({ ok: true, text: "Prices saved. New plans use them now." });
    router.refresh();
  }

  return (
    <Card title="Plan prices" blurb="What a new plan costs. Everyone already on a plan keeps the price they signed up at, and a personal discount below is taken off whatever price applies.">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`pr-${f.key}`} className="text-small font-medium text-slate-200">
              {f.label}
            </label>
            <div className="mt-1 flex items-center gap-2">
              {f.unit === "$" && <span className="text-slate-400">$</span>}
              <input
                id={`pr-${f.key}`}
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                step={1}
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className={`${inputClass} w-28`}
              />
              {f.unit === "%" && <span className="text-slate-400">%</span>}
              {parsed.values[f.key] !== initial[f.key] && <span className="text-small text-signal">Changed</span>}
            </div>
            <p className="mt-1 text-small text-slate-500">{f.help}</p>
          </div>
        ))}
      </div>

      {preview && (
        <div className="mt-5">
          <p className="mb-2 text-small font-medium uppercase tracking-wide text-slate-500">What people will see</p>
          {/* Phones: one small card per plan. From sm up: the table. */}
          <ul className="grid gap-2 sm:hidden">
            {preview.map((r) => (
              <li key={r.term} className="rounded-xl bg-neu-base p-3 shadow-raised-low">
                <p className="text-small font-medium text-slate-100">{r.label}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-small text-slate-300">
                  <dt className="text-slate-500">Per 28 days</dt>
                  <dd className="tabular-nums">{usd(r.monthly)}</dd>
                  <dt className="text-slate-500">Family, per person</dt>
                  <dd className="tabular-nums">{usd(r.family)}</dd>
                  <dt className="text-slate-500">Whole term</dt>
                  <dd className="tabular-nums">{r.months === 1 ? "No commitment" : usd(r.monthly * r.months)}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block" role="region" aria-label="What people will see" tabIndex={0}>
            <table className="w-full min-w-[22rem] text-left text-small">
              <thead>
                <tr className="text-slate-500">
                  <th scope="col" className="py-1 pr-3 font-medium">Plan</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Per 28 days</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Family, per person</th>
                  <th scope="col" className="py-1 font-medium">Whole term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50/10 text-slate-200">
                {preview.map((r) => (
                  <tr key={r.term}>
                    <th scope="row" className="py-2 pr-3 font-medium">{r.label}</th>
                    <td className="py-2 pr-3 tabular-nums">{usd(r.monthly)}</td>
                    <td className="py-2 pr-3 tabular-nums">{usd(r.family)}</td>
                    <td className="py-2 tabular-nums">{r.months === 1 ? "No commitment" : usd(r.monthly * r.months)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {parsed.problem && <p role="alert" className="mt-3 text-small text-red-400">{parsed.problem}</p>}
      {message && <p role="status" className={`mt-3 text-small ${message.ok ? "text-slate-200" : "text-red-400"}`}>{message.text}</p>}

      <div className="mt-4">
        {asking ? (
          <div className="rounded-xl bg-neu-base px-4 py-3 shadow-pressed-low">
            <p className="text-small text-slate-300">
              Save {changed.length} change{changed.length === 1 ? "" : "s"}? New plans and plan changes use these prices straight away, the pricing page and Atom show them, and nobody already on a plan is affected.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setAsking(false)} disabled={busy} className={buttonVariants({ variant: "secondary", size: "sm" })}>Not yet</button>
              <button type="button" onClick={() => void save()} disabled={busy} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>
                {busy && <MorphingSquare size={12} />}
                {busy ? "Saving…" : "Yes, save"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={changed.length === 0 || !!parsed.problem} onClick={() => { setMessage(null); setAsking(true); }} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>
            Save prices
          </button>
        )}
      </div>
    </Card>
  );
}

function PlanLine({ plan, percent }: { plan: { monthlyCents: number; listCents: number } | null; percent: number }) {
  if (!plan) return <span className="text-slate-500">No running plan. It applies when they start one.</span>;
  const after = percent > 0 ? discountedPlanPriceCents(plan.listCents, percent) : plan.listCents;
  return (
    <span className="tabular-nums text-slate-300">
      {usd(plan.monthlyCents)} per 28 days now
      {after !== plan.monthlyCents && (
        <>
          {" "}
          → <span className="font-semibold text-signal">{usd(after)}</span>
        </>
      )}
    </span>
  );
}

function DiscountRow({ row, onSet, onClear }: { row: PricingDiscountRow; onSet: Props["onSetDiscount"]; onClear: Props["onClearDiscount"] }) {
  const router = useRouter();
  const [value, setValue] = useState(String(row.percent));
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const percent = Number(value);
  const valid = Number.isInteger(percent) && percent >= 1 && percent <= MAX_PERSONAL_DISCOUNT_PERCENT;
  const dirty = valid && percent !== row.percent;

  async function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(true);
    setMsg(null);
    const res = await action().catch(() => ({ ok: false as const, error: "That did not go through. Please try again." }));
    setBusy(false);
    setRemoving(false);
    setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-body text-slate-50">{row.name ?? row.email}</p>
          {row.name && <p className="truncate text-small text-slate-500">{row.email}</p>}
          {row.note && <p className="text-small text-slate-400">{row.note}</p>}
          <p className="mt-1 text-small">
            <PlanLine plan={row.plan} percent={valid ? percent : row.percent} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`dp-${row.userId}`}>Percent off for {row.name ?? row.email}</label>
          <input id={`dp-${row.userId}`} type="number" inputMode="numeric" min={1} max={MAX_PERSONAL_DISCOUNT_PERCENT} value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} w-20`} />
          <span className="text-slate-400">% off</span>
          {dirty && (
            <button type="button" disabled={busy} onClick={() => void run(() => onSet(row.userId, percent, row.note ?? ""))} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>
              {busy && <MorphingSquare size={12} />}
              Save {percent}%
            </button>
          )}
          {removing ? (
            <>
              <button type="button" onClick={() => setRemoving(false)} disabled={busy} className={buttonVariants({ variant: "secondary", size: "sm" })}>Keep</button>
              <button type="button" onClick={() => void run(() => onClear(row.userId))} disabled={busy} className={buttonVariants({ variant: "danger", size: "sm" })}>Yes, remove</button>
            </>
          ) : (
            <button type="button" onClick={() => setRemoving(true)} disabled={busy} className={buttonVariants({ variant: "secondary", size: "sm" })}>Remove</button>
          )}
        </div>
      </div>
      {removing && <p className="mt-2 text-small text-slate-400">Their running plan goes back to the price it signed up at, from the next bill (an unpaid bill updates now), and they are told.</p>}
      {!valid && <p role="alert" className="mt-1 text-small text-red-400">Whole number, 1 to {MAX_PERSONAL_DISCOUNT_PERCENT}.</p>}
      {msg && <p role="status" className={`mt-1 text-small ${msg.ok ? "text-slate-200" : "text-red-400"}`}>{msg.text}</p>}
    </li>
  );
}

function AddDiscount({ onSearch, onSet }: { onSearch: Props["onSearch"]; onSet: Props["onSetDiscount"] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscountCandidate[]>([]);
  const [picked, setPicked] = useState<DiscountCandidate | null>(null);
  const [percent, setPercent] = useState("10");
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      onSearch(query).then((rows) => mine === seq.current && setResults(rows)).catch(() => mine === seq.current && setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked, onSearch]);

  const p = Number(percent);
  const valid = Number.isInteger(p) && p >= 1 && p <= MAX_PERSONAL_DISCOUNT_PERCENT;

  async function add() {
    if (!picked || !valid) return;
    setBusy(true);
    setMsg(null);
    const res = await onSet(picked.id, p, note).catch(() => ({ ok: false as const, error: "That did not go through. Please try again." }));
    setBusy(false);
    setAsking(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: res.message });
    setPicked(null);
    setQuery("");
    setNote("");
    router.refresh();
  }

  return (
    <div>
      <label htmlFor="dp-search" className="text-small font-medium text-slate-200">Give someone a discount</label>
      <input id="dp-search" type="search" value={picked ? (picked.name ?? picked.email) : query} onChange={(e) => { setPicked(null); setAsking(false); setQuery(e.target.value); }} placeholder="Search a name or email" autoComplete="off" className={`${inputClass} mt-1 w-full`} />

      {!picked && results.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-50/10 rounded-xl bg-neu-base shadow-raised-low">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { setPicked(r); setPercent(String(r.discountPercent || 10)); setMsg(null); }} className="tap flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-small hover:bg-slate-800/40">
                <span className="min-w-0">
                  <span className="block truncate text-slate-100">{r.name ?? r.email}</span>
                  {r.name && <span className="block truncate text-slate-500">{r.email}</span>}
                </span>
                <span className="shrink-0 text-slate-400">{r.discountPercent > 0 ? `${r.discountPercent}% off now` : r.plan ? (r.plan.family ? "Family plan" : `${usd(r.plan.monthlyCents)} per 28 days`) : "No plan yet"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!picked && query.trim().length >= 2 && results.length === 0 && <p className="mt-2 text-small text-slate-500">Nobody found. Admins and banned accounts are left out.</p>}

      {picked && (
        <div className="mt-3 rounded-xl bg-neu-base p-4 shadow-raised-low">
          {picked.plan?.family && <p className="mb-2 text-small text-amber-300">This account is on a family plan, which keeps the family rate. A discount here applies only if they later start a solo plan.</p>}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="dp-percent" className="text-small font-medium text-slate-200">Percent off</label>
              <div className="mt-1 flex items-center gap-2">
                <input id="dp-percent" type="number" inputMode="numeric" min={1} max={MAX_PERSONAL_DISCOUNT_PERCENT} value={percent} onChange={(e) => { setPercent(e.target.value); setAsking(false); }} className={`${inputClass} w-24`} />
                <span className="text-slate-400">%</span>
              </div>
            </div>
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="dp-note" className="text-small font-medium text-slate-200">Note to yourself (optional)</label>
              <input id="dp-note" type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Friend of the studio" className={`${inputClass} mt-1 w-full`} />
            </div>
          </div>
          <p className="mt-3 text-small">
            {valid ? <PlanLine plan={picked.plan && !picked.plan.family ? picked.plan : null} percent={p} /> : <span className="text-red-400">Whole number, 1 to {MAX_PERSONAL_DISCOUNT_PERCENT}.</span>}
          </p>
          <div className="mt-3">
            {asking ? (
              <div>
                <p className="text-small text-slate-300">
                  Give {picked.name ?? picked.email} {p}% off? Their running plan (and an unpaid bill) changes now, every bill after it too, and they are told. Bills already paid never change.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setAsking(false)} disabled={busy} className={buttonVariants({ variant: "secondary", size: "sm" })}>Not yet</button>
                  <button type="button" onClick={() => void add()} disabled={busy} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>
                    {busy && <MorphingSquare size={12} />}
                    {busy ? "Saving…" : "Yes, give it"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!valid} onClick={() => setAsking(true)} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>
                  {picked.discountPercent > 0 ? "Change discount" : "Give discount"}
                </button>
                <button type="button" onClick={() => { setPicked(null); setQuery(""); }} className={buttonVariants({ variant: "secondary", size: "sm" })}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
      {msg && <p role="status" className={`mt-2 text-small ${msg.ok ? "text-slate-200" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}

export function PricingManager({ initial, discounts, onSavePricing, onSearch, onSetDiscount, onClearDiscount }: Props) {
  return (
    <div className="space-y-5">
      <PricesCard initial={initial} onSave={onSavePricing} />
      <Card title="Discounts for individual accounts" blurb="A percent off one person's plan, on top of the prices above. It prices every solo plan they start or change, and moves their running plan too (bills already paid never change). A family plan keeps the family rate.">
        <AddDiscount onSearch={onSearch} onSet={onSetDiscount} />
        <div className="mt-6">
          <h3 className="text-small font-medium uppercase tracking-wide text-slate-500">Accounts with a discount ({discounts.length})</h3>
          {discounts.length === 0 ? (
            <p className="mt-2 text-small text-slate-500">Nobody yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-50/10">
              {discounts.map((d) => (
                <DiscountRow key={d.userId} row={d} onSet={onSetDiscount} onClear={onClearDiscount} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
