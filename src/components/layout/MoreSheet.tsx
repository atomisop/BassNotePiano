"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "next-auth/react";
import { NavIcon, ICON_PATHS } from "./navIcons";
import { useDismissDrag } from "@/lib/useDismissDrag";

interface MoreItem {
  href: string;
  label: string;
  icon: string;
  dataTour?: string;
}

export function MoreSheet({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Measured rather than guessed: the dismiss threshold and the resistance
  // curve are both fractions of the sheet's own height, and the admin item
  // makes that height vary.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState(320);
  useLayoutEffect(() => {
    if (open && sheetRef.current) setSheetHeight(sheetRef.current.offsetHeight || 320);
  }, [open]);

  const dismiss = useDismissDrag({ axis: "y", size: sheetHeight, onDismiss: onClose });

  // Reopening must start from rest — otherwise the sheet returns still
  // holding wherever the last dismiss left it.
  useEffect(() => {
    if (open) dismiss.offset.set(0);
  }, [open, dismiss.offset]);

  if (!mounted) return null;

  const items: MoreItem[] = [
    { href: "/lessons", label: "Online Lessons", icon: ICON_PATHS.lessons, dataTour: "nav-lessons" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ICON_PATHS.admin }] : []),
    { href: "/account", label: "Settings", icon: ICON_PATHS.settings, dataTour: "nav-settings" },
    { href: "/about", label: "About", icon: ICON_PATHS.about },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end" initial="hidden" animate="visible" exit="hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-scrim/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            // Opaque white sheet, same reasoning as SlideOverPanel — and this
            // is the one that opens on every mobile "More" tap, so it's the
            // most sensitive to per-frame repaint cost.
            style={{ willChange: "transform" }}
            className="w-full"
          >
            {/* Enter/exit lives on the parent; the drag offset lives here, so
                the two transforms compose instead of fighting over `y`. */}
            <motion.div
              ref={sheetRef}
              style={{ y: dismiss.offset, willChange: "transform" }}
              onPointerDown={dismiss.onPointerDown}
              onPointerMove={dismiss.onPointerMove}
              onPointerUp={dismiss.onPointerUp}
              onPointerCancel={dismiss.onPointerUp}
              className="relative w-full touch-none rounded-t-3xl border-t border-ink/10 bg-surface pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            >
            {/* Not decoration — this is the affordance that says the sheet can
                be pushed away, so it has to be true. */}
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-ink/20" />
            <div className="p-3">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  data-tour={item.dataTour}
                  className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm text-slate-200 transition hover:bg-ink/5"
                >
                  <NavIcon path={item.icon} className="h-5 w-5 text-slate-400" />
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm text-slate-200 transition hover:bg-ink/5"
              >
                <NavIcon path={ICON_PATHS.logout} className="h-5 w-5 text-slate-400" />
                Sign out
              </button>
            </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
