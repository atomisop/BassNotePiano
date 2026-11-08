"use client";

import { ChevronLeft } from "@/components/ui/appIcons";
import { useMemo, useState } from "react";
import { Switch as UiSwitch } from "@/components/ui/switch";
import type { SettingDef, SettingValue } from "@/lib/siteSettingsDefs";
import { buttonVariants } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/StatusDot";
import { Hint } from "@/components/ui/Hint";

type SaveResult = { ok: true; value: SettingValue } | { ok: false; error: string };

interface Props {
  defs: SettingDef[];
  categories: { id: string; label: string; blurb: string }[];
  initial: Record<string, SettingValue>;
  onSave: (key: string, value: SettingValue) => Promise<SaveResult>;
  onReset: (key: string) => Promise<SaveResult>;
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return <UiSwitch checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} />;
}

function Row({ def, value, onSave, onReset }: { def: SettingDef; value: SettingValue; onSave: Props["onSave"]; onReset: Props["onReset"] }) {
  const [current, setCurrent] = useState<SettingValue>(value);
  const [draft, setDraft] = useState<string>(String(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = current !== def.default;
  const dirty = def.type !== "toggle" && draft !== String(current);

  async function run(action: Promise<SaveResult>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await action;
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCurrent(r.value);
    setDraft(String(r.value));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const inputClass =
    "rounded-lg bg-neu-base px-3 py-2 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500";

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:max-w-[34rem]">
        <p className="text-body font-medium text-slate-100">
          {def.label}
          {changed && <StatusDot tone="accent" className="ml-2">Changed</StatusDot>}
        </p>
        <p className="mt-0.5 text-small text-slate-500">{def.help}</p>
        {error && <p className="mt-1 text-small text-red-400">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {def.type === "toggle" && <Switch checked={current === true} disabled={busy} label={def.label} onChange={(next) => run(onSave(def.key, next))} />}
        {def.type === "number" && (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={def.min}
              max={def.max}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={def.label}
              className={`${inputClass} w-24`}
            />
            {def.unit && <span className="text-small text-slate-500">{def.unit}</span>}
          </>
        )}
        {def.type === "text" && (
          <input type="text" value={draft} maxLength={def.maxLength} onChange={(e) => setDraft(e.target.value)} aria-label={def.label} className={`${inputClass} w-full sm:w-72`} />
        )}
        {dirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onSave(def.key, def.type === "number" ? Number(draft) : draft))}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Save
          </button>
        )}
        {saved && <span className="text-small text-signal-fg">Saved</span>}
        {changed && !dirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onReset(def.key))}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            title={`Back to ${String(def.default)}`}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsPanel({ defs, categories, initial, onSave, onReset }: Props) {
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  // Phones: one group at a time instead of one very long page. Null = the list of groups.
  const [active, setActive] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  // Searching or filtering to "what I changed" shows every match at once, on any screen size.
  const browsing = !q && !onlyChanged;

  // "Changed" means different from the built-in default, so you can see everything you have ever touched in one list.
  const shown = useMemo(
    () =>
      defs.filter(
        (d) => (!q || `${d.label} ${d.help} ${d.key}`.toLowerCase().includes(q)) && (!onlyChanged || (initial[d.key] ?? d.default) !== d.default),
      ),
    [defs, q, onlyChanged, initial],
  );
  const changedCount = defs.filter((d) => (initial[d.key] ?? d.default) !== d.default).length;

  return (
    <div className="space-y-6">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search settings"
        aria-label="Search settings"
        className="w-full rounded-xl bg-neu-base px-4 py-2.5 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={onlyChanged}
          onClick={() => setOnlyChanged((v) => !v)}
          className={`tap rounded-full px-3 py-1 text-small font-medium ${onlyChanged ? "bg-neu-lift text-signal-fg shadow-pressed-low" : "bg-neu-base text-slate-300 shadow-raised-low"}`}
        >
          Only what I changed ({changedCount})
        </button>
        {/* From md up the whole list shows, with these to jump around it. */}
        {categories.map((c) => (
          <a key={c.id} href={`#settings-${c.id}`} className="tap hidden items-center rounded-full bg-neu-base px-3 py-1 text-small text-slate-400 shadow-raised-low hover:text-slate-100 md:inline-flex">
            {c.label}
          </a>
        ))}
      </div>
      {browsing && active === null && (
        <div className="grid grid-cols-2 gap-3 md:hidden">
          {categories.map((c) => {
            const count = defs.filter((d) => d.category === c.id).length;
            if (count === 0) return null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className="tap flex min-h-[4.5rem] flex-col items-start justify-between rounded-2xl bg-neu-base p-3.5 text-left shadow-raised-low active:shadow-pressed-low"
              >
                <span className="text-small font-semibold text-slate-50">{c.label}</span>
                <span className="text-small text-slate-500">{count} {count === 1 ? "setting" : "settings"}</span>
              </button>
            );
          })}
        </div>
      )}
      {browsing && active !== null && (
        <button
          type="button"
          onClick={() => setActive(null)}
          className="tap sticky top-0 z-10 -mb-2 inline-flex items-center gap-1.5 rounded-full bg-neu-lift px-3.5 py-1.5 text-small font-medium text-slate-100 shadow-raised-low md:hidden"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
          All settings
        </button>
      )}
      {categories.map((c) => {
        const rows = shown.filter((d) => d.category === c.id);
        if (rows.length === 0) return null;
        return (
          <section key={c.id} id={`settings-${c.id}`} className={`glass-surface p-5 ${browsing && active !== c.id ? "hidden md:block" : ""}`}>
            <h2 className="text-title font-semibold text-slate-50">{c.label}</h2>
            <p className="text-small text-slate-500">{c.blurb}</p>
            <div className="mt-2 divide-y divide-slate-700/40">
              {rows.map((d) => (
                <Row key={d.key} def={d} value={initial[d.key] ?? d.default} onSave={onSave} onReset={onReset} />
              ))}
            </div>
          </section>
        );
      })}
      {shown.length === 0 && <p className="text-small text-slate-500"><Hint>No settings match that search.</Hint></p>}
    </div>
  );
}
