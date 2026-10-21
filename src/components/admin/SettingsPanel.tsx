"use client";

import { useMemo, useState } from "react";
import { Switch as UiSwitch } from "@/components/ui/switch";
import type { SettingDef, SettingValue } from "@/lib/siteSettingsDefs";
import { buttonVariants } from "@/components/ui/button";

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
          {changed && <span className="ml-2 rounded-full bg-[rgb(var(--signal)/0.16)] px-2 py-0.5 text-small font-medium text-signal-fg">Changed</span>}
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
  const q = query.trim().toLowerCase();

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
        {categories.map((c) => (
          <a key={c.id} href={`#settings-${c.id}`} className="tap inline-flex items-center rounded-full bg-neu-base px-3 py-1 text-small text-slate-400 shadow-raised-low hover:text-slate-100">
            {c.label}
          </a>
        ))}
      </div>
      {categories.map((c) => {
        const rows = shown.filter((d) => d.category === c.id);
        if (rows.length === 0) return null;
        return (
          <section key={c.id} id={`settings-${c.id}`} className="glass-surface p-5">
            <h2 className="text-body font-semibold text-slate-50">{c.label}</h2>
            <p className="text-small text-slate-500">{c.blurb}</p>
            <div className="mt-2 divide-y divide-slate-700/40">
              {rows.map((d) => (
                <Row key={d.key} def={d} value={initial[d.key] ?? d.default} onSave={onSave} onReset={onReset} />
              ))}
            </div>
          </section>
        );
      })}
      {shown.length === 0 && <p className="text-small text-slate-500">No settings match that search.</p>}
    </div>
  );
}
