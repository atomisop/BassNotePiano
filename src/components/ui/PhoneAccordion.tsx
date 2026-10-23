"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A section that is collapsed on phones and always open from md up, so a long page of cards becomes a short list of titles you
 * open only when you want them. The summary stays visible while it is closed (a count, a status), so closing a section never
 * hides the one fact you came for.
 *
 * It is pure CSS on the open/close side (`hidden md:block`), so the server render matches the client on every screen size and
 * nothing flashes open then shut. Below md the title is a button; from md up it is a plain heading.
 */
export function PhoneAccordion({
  title,
  summary,
  warn = false,
  defaultOpen = false,
  id,
  className,
  children,
}: {
  title: string;
  /** Shown to the right of the title while closed on a phone. */
  summary?: ReactNode;
  /** Colours the summary as a problem. */
  warn?: boolean;
  defaultOpen?: boolean;
  /** An address like `/admin#tasks` opens this section on a phone, where it would otherwise be closed. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  useEffect(() => {
    if (id && window.location.hash === `#${id}`) setOpen(true);
  }, [id]);
  return (
    <section id={id} className={cn("p-5", className)}>
      <h2 className="hidden text-body font-semibold text-slate-50 md:block">{title}</h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="tap -my-1 flex w-full items-center justify-between gap-3 py-1 text-left md:hidden"
      >
        <span className="text-body font-semibold text-slate-50">{title}</span>
        <span className="flex items-center gap-2">
          {summary != null && !open && <span className={cn("text-small", warn ? "font-medium text-red-300" : "text-slate-400")}>{summary}</span>}
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <div id={bodyId} className={cn("mt-3", open ? "block" : "hidden md:block")}>
        {children}
      </div>
    </section>
  );
}
