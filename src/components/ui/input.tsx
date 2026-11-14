import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

// 16px (text-body) on purpose: anything smaller makes iOS Safari zoom the
// whole fixed app shell when the field is focused.
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // The 21st.dev glass field (lgx-input in globals.css): field glass under a dark 15% wash, an inset ring that brightens
          // on hover and turns into a 2px ring on focus.
          "lgx-input flex h-10 w-full rounded-control border border-transparent px-3.5 py-2 text-body text-slate-50 file:border-0 file:bg-transparent file:text-small file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
