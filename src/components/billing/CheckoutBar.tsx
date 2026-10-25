"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NumberTicker } from "@/components/ui/number-ticker";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * The price and the next step, always on screen while the rest of the form scrolls: on a phone or tablet it is pinned to the bottom
 * of the screen just above the dock (drawn into the page body, like the dock itself, so nothing about the page it sits in can move
 * it); from lg up, where there is no dock, it rests at the bottom of the content. When something is still missing it says what, and
 * the button waits.
 */
export function CheckoutBar(props: {
  priceCents: number;
  /** After the price, e.g. "first payment" or "every 28 days". */
  priceNote: string;
  detail: string;
  /** What is still missing; when set it replaces the detail and the button is off. */
  hint: string | null;
  actionLabel: string;
  onAction: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      {/* Phones and tablets: fixed above the dock. */}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(1.25rem,env(safe-area-inset-bottom,0px)-0.25rem)+4.25rem)] z-30 flex justify-center px-4 lg:hidden">
            <div className="pointer-events-auto w-full max-w-xl">
              <Bar {...props} />
            </div>
          </div>,
          document.body,
        )}
      {/* lg and up: no dock, so it sticks near the bottom of the content. */}
      <div className="sticky bottom-2 z-30 hidden lg:block">
        <Bar {...props} />
      </div>
      {/* Room at the end of the form so the last thing on the page can scroll up above the fixed bar. */}
      <div aria-hidden className="h-24 lg:hidden" />
    </>
  );
}

function Bar({ priceCents, priceNote, detail, hint, actionLabel, onAction }: { priceCents: number; priceNote: string; detail: string; hint: string | null; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-neu-lift p-3 shadow-raised-high ring-1 ring-[rgb(var(--c-s-50)/0.1)]">
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="text-body font-semibold leading-tight text-slate-50">
          <NumberTicker value={priceCents} format={usd} /> <span className="text-small font-normal text-slate-400">{priceNote}</span>
        </p>
        <p className={cn("mt-0.5 text-small leading-snug", hint ? "text-amber-300" : "text-slate-400")}>{hint ?? detail}</p>
      </div>
      <button type="button" disabled={hint !== null} onClick={onAction} className={buttonVariants({ variant: "primary", className: "shrink-0" })}>
        {actionLabel}
      </button>
    </div>
  );
}
