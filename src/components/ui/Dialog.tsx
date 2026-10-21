"use client";

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One dialog that adapts to the screen, the way iOS does it: a bottom sheet
 * on phones (with a grab handle, slides up) and a centered modal from the
 * md breakpoint up. Built on Radix Dialog, so focus trapping, Escape to
 * close, and screen-reader labelling come for free.
 *
 * Sits above the app chrome on the overlay layer, with an opaque surface so
 * page text never reads through it.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-scrim/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-(--z-overlay) flex max-h-[90svh] flex-col bg-neu-base text-slate-100 shadow-raised-high outline-none",
            // Phone: bottom sheet.
            "inset-x-0 bottom-0 rounded-t-sheet pb-[max(1.25rem,env(safe-area-inset-bottom))] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom",
            // md and up: centered modal.
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet md:pb-0 md:data-[state=open]:slide-in-from-bottom-4 md:data-[state=open]:fade-in-0 md:data-[state=closed]:fade-out-0",
            "duration-(--dur-slow) ease-(--ease-ios)",
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-neu-base shadow-pressed-low md:hidden" />
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <DialogPrimitive.Title className="text-body font-semibold text-slate-50">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-small text-slate-400">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-shadow hover:text-slate-50 hover:shadow-raised-low active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-body text-slate-200">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink/[0.08] px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
