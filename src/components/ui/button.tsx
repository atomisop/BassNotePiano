import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { MorphingSquare } from "@/components/ui/morphing-square"

/**
 * The one button for the whole app. Buttons live on the front plane of the
 * depth system (see globals.css), so every variant except `link` lifts on
 * hover and presses down on click: a color change alone was reported as
 * "almost impossible to tell if I need to click it or not".
 *
 * Color rule: `default` (alias `primary`) is the screen section's ONE main
 * action. It is signal green via --cta-bg, except on the public marketing
 * pages, which reset --cta-bg to the neutral --primary. `paper` is the
 * neutral solid button for places that must not push one choice (the cookie
 * banner). Everything else is ink and paper, never green.
 */
const lift =
  "transition-[filter,transform,box-shadow,background-color,color] duration-(--dur-fast) ease-(--ease-ios) hover:-translate-y-0.5 active:translate-y-px motion-reduce:hover:translate-y-0"

const primary = cn(
  "relative border border-[rgb(var(--cta-bg,var(--primary))/0.5)] bg-[rgb(var(--cta-bg,var(--primary)))] text-[rgb(var(--cta-ink,var(--primary-foreground)))] font-semibold shadow-plane-front hover:brightness-110 active:brightness-95",
  "hover:shadow-signal",
  lift,
)

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-small font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: primary,
        primary,
        paper: cn(
          "relative border border-[rgb(var(--primary)/0.5)] bg-[rgb(var(--primary))] text-primary-foreground font-semibold shadow-plane-front hover:brightness-110 active:brightness-95",
          lift,
        ),
        // Quiet, raised paper/ink button for every secondary action.
        secondary: cn(
          "border border-ink/10 bg-[rgb(var(--c-s-50)/0.06)] text-slate-50 shadow-plane-mid hover:bg-[rgb(var(--c-s-50)/0.1)]",
          lift,
        ),
        outline: cn("border border-ink/15 bg-transparent text-slate-100 hover:bg-[rgb(var(--c-s-50)/0.06)]", lift),
        ghost: cn("text-slate-300 hover:bg-[rgb(var(--c-s-50)/0.06)] hover:text-slate-50", lift),
        destructive: cn(
          "border border-[rgb(var(--c-rd-400)/0.5)] bg-[rgb(var(--c-rd-400)/0.12)] text-[rgb(var(--c-rd-300))] hover:bg-[rgb(var(--c-rd-400)/0.2)]",
          lift,
        ),
        // Inline text link: tappable, so it carries the signal color.
        link: "text-signal underline-offset-4 hover:underline",
        glass: cn("glass-surface-elevated text-[rgb(var(--c-s-50))] hover:brightness-110", lift),
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5",
        lg: "h-12 px-6",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={asChild ? disabled : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {!asChild && loading ? (
          <>
            <MorphingSquare size={14} className="shrink-0" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
