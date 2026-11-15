"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { GlassLens } from "@/components/ui/GlassLens";
import { GLASS_RECIPES } from "@/lib/liquidGlassMaps";
import { isPhotoAuthPath } from "@/components/auth/AuthBackdrop";
import { cn } from "@/lib/utils";

const CARD = GLASS_RECIPES.card;

/**
 * The 21st.dev "Liquid Glass Login" card (reference/liquid-glass-login.tsx): the glass is an absolute layer BEHIND the content (radius
 * 32, bevel 56, scale 72, aberration 16, frost 0.4, tint 0.10, the source's shadow), so the fields and buttons inside keep their own
 * glass and still bend the photo. On /login and /register the card can be dragged by its glass with a MOUSE (never on touch, so the
 * page still scrolls on short phones); fields, links and buttons keep working normally.
 */
export function AuthGlassCard({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const draggable = isPhotoAuthPath(pathname);
  const cardRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("input, button, a, label, textarea, select, [role='button'], [contenteditable]")) return;
    e.preventDefault(); // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ...offset.current };
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const card = cardRef.current;
    if (!d || !card) return;
    // Keep the card on screen.
    const box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const r = card.getBoundingClientRect();
    const left = r.left - offset.current.x;
    const top = r.top - offset.current.y;
    const x = Math.min(box.right - left - r.width, Math.max(box.left - left, d.x + e.clientX - d.px));
    const y = Math.min(box.bottom - top - r.height, Math.max(box.top - top, d.y + e.clientY - d.py));
    offset.current = { x, y };
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const onDragEnd = () => {
    drag.current = null;
  };

  return (
    <div
      ref={cardRef}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      data-auth-card
      className={cn("relative w-full rounded-[32px] text-slate-50", draggable && "md:cursor-grab md:active:cursor-grabbing [&_input]:cursor-text", className)}
    >
      <GlassLens
        surface
        radius={CARD.radius}
        bezel={CARD.bevelDepth}
        strength={CARD.scale}
        aberration={CARD.aberration}
        frost={CARD.frost}
        tint={`rgb(255 255 255 / ${CARD.tint})`}
        className="lgx-auth-card-glass"
      />
      <div className="relative px-6 py-8 sm:px-9 sm:py-10">{children}</div>
    </div>
  );
}
