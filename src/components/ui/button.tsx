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
// Neumorphic press: raised at rest, the same shape pushes IN (pressed
// shadow) and dips (scale, from the center, so layout never shifts) while
// held, then springs back (see `press` in globals.css).
const lift = "press active:shadow-pressed-low"

const primary = cn(
  "liquid-signal relative bg-[rgb(var(--cta-bg,var(--primary)))] text-[rgb(var(--cta-ink,var(--primary-foreground)))] font-semibold hover:brightness-110 active:brightness-95",
  lift,
)

const buttonVariants = cva(
  "tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-small font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: primary,
        primary,
        paper: cn(
          "relative bg-[rgb(var(--primary))] text-primary-foreground font-semibold shadow-raised-mid hover:brightness-110 active:brightness-95",
          lift,
        ),
        // Quiet, raised paper/ink button for every secondary action.
        secondary: cn("liquid text-slate-50 hover:text-white", lift),
        outline: cn("liquid text-slate-100", lift),
        ghost: cn("text-slate-300 hover:text-slate-50 hover:liquid", lift),
        destructive: cn("liquid text-[rgb(var(--c-rd-300))]", lift),
        // Inline text link: tappable, so it carries the signal color.
        // Solid red: only for the final, irreversible step of a destructive flow.
        danger: cn("liquid-signal relative bg-red-600 text-white font-semibold [--cta-bg:220_38_38] hover:brightness-110 active:brightness-95", lift),
        link: "text-signal-fg underline-offset-4 hover:underline",
        glass: cn("liquid text-[rgb(var(--c-s-50))] hover:brightness-110", lift),
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
        iconSm: "h-8 w-8 px-0",
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
