"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { personPeekAction, type PersonPeek } from "@/app/(dashboard)/admin/person-peek-actions";
import { personActionHref } from "@/lib/commandRecents";

/**
 * A side panel beside the Accounts list: the person's key facts and their most used jobs, so the list stays in view while you look.
 * Computers only (the list opens the full page on a phone). Escape or the X closes it; "Open full page" goes to the whole account.
 */
export function PersonPeekPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<PersonPeek | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    personPeekAction(userId)
      .then((d) => alive && (d ? setData(d) : setFailed(true)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const job = "tap inline-flex items-center";
  return (
    <aside aria-label="Account summary" className="glass-surface fixed bottom-4 right-4 top-[4.25rem] z-50 hidden w-[22rem] flex-col overflow-y-auto p-5 lg:flex">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-title font-semibold text-slate-50">{data ? (data.name ?? data.email) : "Loading…"}</p>
          {data?.name && <p className="truncate text-small text-slate-400">{data.email}</p>}
          {data?.banned && <p className="mt-1 text-small text-red-300">Banned</p>}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close summary" className="tap rounded-full p-1.5 text-slate-400 hover:text-slate-100">
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>

      {failed && <p className="mt-4 text-small text-red-300">Could not load this person.</p>}
      {data && (
        <>
          <dl className="mt-4 divide-y divide-slate-50/10">
            {data.facts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-small text-slate-500">{f.label}</dt>
                <dd className={`text-small font-semibold ${f.warn ? "text-amber-300" : "text-slate-50"}`}>{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/admin/users/${data.id}`} className={buttonVariants({ size: "sm" })}>Open full page</Link>
            <Link href={personActionHref(data.id, "credits")} className={`${buttonVariants({ variant: "secondary", size: "sm" })} ${job}`}>Add credits</Link>
            <Link href={personActionHref(data.id, "book")} className={`${buttonVariants({ variant: "secondary", size: "sm" })} ${job}`}>Book a class</Link>
            <Link href={personActionHref(data.id, "plan")} className={`${buttonVariants({ variant: "secondary", size: "sm" })} ${job}`}>Plan tools</Link>
          </div>
        </>
      )}
    </aside>
  );
}
