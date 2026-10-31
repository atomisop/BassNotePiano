"use client";

import type { ButtonHTMLAttributes } from "react";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

/**
 * A button that shows what is missing instead of a sentence next to it. While `reason` is set it looks switched off, and pressing it says
 * the reason in a small popup (two to four words: "Pick an instrument"). With no reason it is a normal button.
 */
export function GuardedButton({ reason, onClick, className, children, ...rest }: { reason: string | null } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled">) {
  return (
    <button
      type="button"
      {...rest}
      aria-disabled={reason !== null}
      onClick={(event) => {
        if (reason !== null) {
          toast.warning(reason);
          return;
        }
        onClick?.(event);
      }}
      className={cn(className, reason !== null && "cursor-not-allowed opacity-45 saturate-50")}
    >
      {children}
    </button>
  );
}
