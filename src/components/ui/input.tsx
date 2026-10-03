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
          // A pressed (inset) well on the base surface, with a faint edge so
          // the field is still recognizable (neumorphism guardrail).
          "flex h-11 w-full rounded-control border border-(--neu-edge) bg-neu-base px-3.5 py-2 text-body text-slate-50 shadow-pressed-low ring-offset-background transition-[border-color,box-shadow] duration-(--dur-fast) focus-visible:border-signal file:border-0 file:bg-transparent file:text-small file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
