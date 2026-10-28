"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";

/**
 * "Select child": the picker from the reference's Select Student popover. A button showing who you are looking at opens a list
 * with a search box, each child with a colored initial and a check on the chosen one, and one clear Select button. It only moves
 * between children the parent is already linked to; the page it opens does its own access check.
 */
const TINTS = ["tint-purple", "tint-peach", "tint-blue", "tint-green", "tint-pink", "tint-yellow"] as const;

export function ChildSwitcher({ currentId, kids }: { currentId: string; kids: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(currentId);
  const [query, setQuery] = useState("");
  const current = kids.find((k) => k.id === currentId);
  const shown = useMemo(() => kids.filter((k) => k.name.toLowerCase().includes(query.trim().toLowerCase())), [kids, query]);

  if (kids.length < 2) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPicked(currentId);
          setQuery("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="tap inline-flex items-center gap-2 rounded-full bg-neu-base px-3 py-1.5 text-small font-medium text-slate-100 shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
      >
        <span className={`${TINTS[kids.findIndex((k) => k.id === currentId) % TINTS.length]} flex h-6 w-6 items-center justify-center rounded-full text-[0.6875rem] font-semibold`}>
          {(current?.name ?? "?").charAt(0).toUpperCase()}
        </span>
        Switch child
        <ChevronDown aria-hidden className="h-4 w-4 text-slate-400" />
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Select child"
        description="You can switch to another child here."
        footer={
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              if (picked !== currentId) router.push(`/parent/${picked}`);
            }}
            className={buttonVariants({ variant: "primary", className: "w-full" })}
          >
            Select
          </button>
        }
      >
        <label className="flex items-center gap-2 rounded-full bg-neu-base px-3.5 py-2 shadow-pressed-low">
          <Search aria-hidden className="h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for child"
            aria-label="Search for child"
            className="w-full bg-transparent text-body text-slate-100 outline-none placeholder:text-slate-500"
          />
        </label>
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Children">
          {shown.length === 0 && <li className="px-2 py-3 text-small text-slate-500">No one matches.</li>}
          {shown.map((k) => {
            const on = k.id === picked;
            return (
              <li key={k.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => setPicked(k.id)}
                  className={`tap flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${on ? "bg-[rgb(var(--c-s-50)/0.06)]" : "hover:bg-[rgb(var(--c-s-50)/0.04)]"}`}
                >
                  <span className={`${TINTS[kids.findIndex((x) => x.id === k.id) % TINTS.length]} flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-small font-semibold`}>
                    {k.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-slate-50">{k.name}</span>
                  {on && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-signal text-slate-950">
                      <Check aria-hidden className="h-4 w-4" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
