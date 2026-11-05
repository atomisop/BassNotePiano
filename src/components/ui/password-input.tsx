"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { IconSwap } from "@/components/ui/IconSwap";

/**
 * A password field a visitor can actually check before submitting.
 *
 * Every password field in this app used to be a plain masked `<Input
 * type="password">` with no way to see what was typed. That's a real
 * error-prevention gap (a typo in a masked field is invisible until the
 * submit fails), not a cosmetic one. This wraps the same `Input` primitive
 * with a show/hide toggle, so it's a drop-in replacement at every call site rather
 * than a new component to learn.
 *
 * The toggle button is `tabIndex={-1}`: it's a convenience, not a stop on
 * the way to the submit button, so it doesn't add an extra Tab stop between
 * "password" and whatever field/button comes next.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input type={visible ? "text" : "password"} className={cn("pr-10", className)} ref={ref} {...props} />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition hover:text-slate-300"
        >
          <IconSwap state={visible}>{visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}</IconSwap>
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
