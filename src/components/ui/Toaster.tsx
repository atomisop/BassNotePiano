"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

/**
 * #1 — Toast notifications.
 *
 * Styled through `toastOptions.classNames` rather than Sonner's own CSS
 * variables. Sonner ships light/dark themes built on fixed colours; this app
 * has 3 themes (each with universal glass, its own ground colour, and a
 * 5-way accent choice) driven by the ramp in themes.css, so the only way a
 * toast matches the page it appears over is to hand it the same surface
 * classes every other panel uses (`.glass-surface`, `slate-*`, `amber-*`).
 *
 * `richColors` is deliberately off for the same reason — it would inject
 * Sonner's own green/red rather than the ramp's emerald-400/red-400.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      // Sonner's default is 'light'; forcing 'system' off keeps it from
      // applying a palette on top of the classNames below.
      theme="light"
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-card !bg-surface !shadow-plane-front text-slate-100 !border-ink/10 !text-small",
          title: "!text-small font-semibold text-slate-50",
          description: "!text-small !text-slate-400",
          // Solid --primary, neutral — see globals.css's own `--primary`
          // comment: green was tried for real CTAs too and reverted by
          // direct instruction.
          actionButton: "!rounded-control !bg-[rgb(var(--cta-bg,var(--primary)))] !text-[rgb(var(--cta-ink,var(--primary-foreground)))] !font-semibold",
          cancelButton: "!bg-slate-900 !text-slate-300",
          closeButton: "!bg-surface !border-ink/10 !text-slate-400",
          // Success is paper text plus sonner's own check icon, never green
          // (green means "tap this" only).
          success: "!text-slate-50",
          error: "!text-red-400",
        },
      }}
    />
  );
}

export { toast };
