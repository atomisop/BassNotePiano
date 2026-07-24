"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "next-auth/react";
import { NavIcon, ICON_PATHS } from "./navIcons";

interface MoreItem {
  href: string;
  label: string;
  icon: string;
}

export function MoreSheet({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const items: MoreItem[] = [
    { href: "/lessons", label: "Lessons", icon: ICON_PATHS.lessons },
    ...(isAdmin ? [{ href: "/admin/payments", label: "Admin", icon: ICON_PATHS.admin }] : []),
    { href: "/account", label: "Settings", icon: ICON_PATHS.settings },
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
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="relative w-full rounded-t-3xl border-t border-white/10 bg-slate-950/98 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-2xl"
          >
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="p-3">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm text-slate-200 transition hover:bg-white/5"
                >
                  <NavIcon path={item.icon} className="h-5 w-5 text-slate-400" />
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
              >
                <NavIcon path={ICON_PATHS.logout} className="h-5 w-5 text-slate-400" />
                Sign out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
