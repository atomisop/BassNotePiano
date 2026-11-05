"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown as CaretDown } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One button that opens a small panel of related actions, so a page shows one choice instead of a row of seven.
 *
 * The panel stays MOUNTED while closed (it is only hidden): each action in it is a button that owns its own dialog, and that
 * dialog lives in a portal, so closing the panel after a tap never closes the dialog the tap opened.
 * Closes on a tap inside, a tap outside and Escape.
 */
export function ActionMenu({ label, icon, children, align = "left", className, openEvent }: { label: string; icon?: ReactNode; children: ReactNode; align?: "left" | "right"; className?: string; /** A window event name that opens the panel (the command menu uses it to jump to a job). */ openEvent?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!openEvent) return;
    const show = () => setOpen(true);
    window.addEventListener(openEvent, show);
    return () => window.removeEventListener(openEvent, show);
  }, [openEvent]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        {icon}
        {label}
        <CaretDown aria-hidden className={cn("ml-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {/* Stays mounted while closed (a dialog opened from a button in here keeps its state); it fades and shrinks from the trigger's corner
          (rules 10, 11, 12, 15) and is taken out of the tab order and the pointer path once it has left. */}
      <div
        id={panelId}
        aria-hidden={!open}
        data-open={open ? "" : undefined}
        // A tap on any action closes the panel on the next turn, after that action's own click has run.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) window.setTimeout(() => setOpen(false), 0);
        }}
        className={cn(
          "menu-panel glass-menu absolute top-full z-30 mt-2 flex min-w-[15rem] max-w-[calc(100vw-2rem)] flex-col items-stretch gap-1 rounded-2xl p-2 [&>*]:justify-start [&_button]:w-full [&_button]:justify-start",
          align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A quiet heading inside an ActionMenu that separates everyday actions from rare or risky ones. */
export function ActionMenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-2 text-caption font-medium uppercase tracking-caps text-slate-50/60">{children}</p>;
}
