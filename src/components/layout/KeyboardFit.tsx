"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A full-height box that follows the part of the screen the phone keyboard leaves free (iOS does not shrink `100dvh` for the
 * keyboard), so a chat's input rides on top of the keyboard like in any messaging app. With the keyboard shut it is the normal
 * full height with room for the dock; with it open the dock room goes, since the keyboard covers the dock.
 */
export function KeyboardFit({ children, className = "", topOffset = "3rem" }: { children: ReactNode; className?: string; topOffset?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vvh, setVvh] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const keyboard = window.innerHeight - vv.height > 120;
      setOpen(keyboard);
      setVvh(keyboard ? vv.height : null);
      if (keyboard) {
        // Keep the page itself from sliding up under the top bar while the keyboard is open.
        if (window.scrollY !== 0) window.scrollTo(0, 0);
        const chat = ref.current?.querySelector("[data-chat-scroll]");
        if (chat instanceof HTMLElement) chat.scrollTop = chat.scrollHeight;
      }
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ height: `calc(${vvh ? `${vvh}px` : "100dvh"} - ${topOffset})` }}
      className={`flex overflow-hidden ${open ? "pb-0" : "pb-24 lg:pb-0"} ${className}`}
    >
      {children}
    </div>
  );
}
