"use client";

import { Search } from "@/components/ui/appIcons";

/**
 * Client-side search for the admin lists (STEP 4). Filters only what the
 * page already loaded, so it adds no new data access. Matches anywhere in a
 * row's values (name, email, reference code, amount...), case-insensitive.
 */
export function matchesQuery(item: unknown, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return JSON.stringify(item, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).toLowerCase().includes(q);
}

export function AdminListSearch({
  value,
  onChange,
  placeholder,
  shown,
  total,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  shown: number;
  total: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="relative min-w-0 flex-1 sm:max-w-sm">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="glass-surface-subtle h-11 w-full rounded-control pl-9 pr-3 text-body text-slate-50 placeholder:text-slate-500 focus-visible:border-signal focus-visible:outline-none"
        />
      </label>
      {value.trim() && (
        <p className="text-small text-slate-400" aria-live="polite">
          {shown} of {total}
        </p>
      )}
    </div>
  );
}
