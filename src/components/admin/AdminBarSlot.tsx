"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The admin's section bar and tabs. From md up they stay in the page (a pinned heading). On phones they move INTO the top card
 * (the slot `#bar-admin-slot` in TopBar.tsx), so one card holds the logo row and the admin menu and nothing has to be stacked
 * above or below it. Before the page has loaded they render in the page, so the server HTML is complete without scripts.
 */
export function AdminBarSlot({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 767.98px)");
    const sync = () => setSlot(phone.matches ? document.getElementById("bar-admin-slot") : null);
    sync();
    phone.addEventListener("change", sync);
    return () => phone.removeEventListener("change", sync);
  }, []);

  if (slot) return createPortal(children, slot);
  return (
    <div data-deck-header className="deck-header -mt-4 pt-4">
      {children}
    </div>
  );
}
