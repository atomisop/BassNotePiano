"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown as CaretDown } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One button that opens a small panel of related actions, so a page shows one choice instead of a row of seven.
 *
 * The panel stays MOUNTED while closed (it is only hidden): each action in it is a button that owns its own dialog, and that
 * dialog lives in a portal, so closing the panel after a tap never closes the dialog the tap opened.
 * Closes on a tap inside, a tap outside and Escape.
 *
 * The panel is drawn in a portal on <body> with a fixed position worked out from the button, so no card can ever cover or clip it: a
 * card that comes later on the page, a card with its own stacking (a transform, a blur, a squircle) or one that hides its overflow.
 * It opens below the button, or above it when there is more room there, and follows the button while the page scrolls.
 */
export function ActionMenu({ label, icon, children, align = "left", className, openEvent }: { label: string; icon?: ReactNode; children: ReactNode; align?: "left" | "right"; className?: string; /** A window event name that opens the panel (the command menu uses it to jump to a job). */ openEvent?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Where the panel sits on the screen (fixed), and whether it opened upward.
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!panel.current || !root.current) return;
      const margin = 16;
      const gap = 8;
      const width = panel.current.offsetWidth;
      const height = panel.current.scrollHeight;
      const anchor = root.current.getBoundingClientRect();
      let left = align === "right" ? anchor.right - width : anchor.left;
      left = Math.min(left, window.innerWidth - margin - width);
      left = Math.max(left, margin);
      const below = window.innerHeight - anchor.bottom - gap - margin;
      const above = anchor.top - gap - margin;
      const up = height > below && above > below;
      const room = Math.max(120, up ? above : below);
      const shown = Math.min(height, room);
      setPos({ top: up ? anchor.top - gap - shown : anchor.bottom + gap, left, up, maxHeight: room });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align]);

  useEffect(() => {
    if (!openEvent) return;
    const show = () => setOpen(true);
    window.addEventListener(openEvent, show);
    return () => window.removeEventListener(openEvent, show);
  }, [openEvent]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
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
      {mounted &&
        createPortal(
          <div
            id={panelId}
            ref={panel}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, maxHeight: pos?.maxHeight }}
            aria-hidden={!open}
            data-open={open && pos ? "" : undefined}
            // A tap on any action closes the panel on the next turn, after that action's own click has run.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button, a")) window.setTimeout(() => setOpen(false), 0);
            }}
            className={cn(
              "menu-panel glass-menu fixed z-50 flex min-w-[15rem] max-w-[calc(100vw-2rem)] flex-col items-stretch gap-1 overflow-y-auto rounded-2xl p-2 [&>*]:justify-start [&_button]:w-full [&_button]:justify-start",
              pos?.up ? (align === "right" ? "origin-bottom-right" : "origin-bottom-left") : align === "right" ? "origin-top-right" : "origin-top-left",
            )}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** A quiet heading inside an ActionMenu that separates everyday actions from rare or risky ones. */
export function ActionMenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-2 text-caption font-medium uppercase tracking-caps text-slate-50/60">{children}</p>;
}
