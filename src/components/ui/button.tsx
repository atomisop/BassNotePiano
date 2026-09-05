import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { MorphingSquare } from "@/components/ui/morphing-square"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        /* "Liquid glass" chemistry, adapted from a 21st.dev reference —
           layered inner highlight + outer shadow, tactile hover brighten —
           onto real theme tokens (`--primary`) instead of the reference's
           literal hex fills, so it retints correctly across every theme
           rather than only looking right in the one the reference happened
           to be built in. Left out: the reference's SVG-turbulence backdrop
           distortion (`backdrop-filter: url(#id)`) — unsupported in Safari
           entirely, and exactly the kind of decorative novelty effect this
           project's own design direction rules out for buttons. What's
           kept — the fill, the shadow, the hover response — renders
           identically in every real browser.
           Solid `--primary` now, not an accent gradient (`--c-a-mid/400/
           500`, still there, just no longer read for a button fill — see
           globals.css's own `.cta-fill` comment): the "premium black and
           white" pass now covers real CTAs too, by direct instruction, so
           nothing in the app renders the accent ramp as a fill anymore.
           Every variant below except `link` also lifts on hover and presses
           down on click (-translate-y-0.5 / translate-y-px), on top of
           whatever color/fill response it already had. Direct instruction:
           a filter/color change alone read as "almost impossible to
           tell if I need to click it or not". `link` stays flat: it's
           styled as inline text, not a button, so a 3D lift would fight
           its own look the same way it would on marketing's `.btn-quiet`. */
        default:
          "relative border border-[rgb(var(--primary)/0.5)] bg-[rgb(var(--primary))] text-primary-foreground shadow-[0_1px_1px_rgba(255,255,255,0.25)_inset,0_-1px_1px_rgba(0,0,0,0.12)_inset,0_6px_16px_-6px_rgba(0,0,0,0.4)] transition-[filter,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_1px_1px_rgba(255,255,255,0.25)_inset,0_-1px_1px_rgba(0,0,0,0.12)_inset,0_10px_24px_-8px_rgba(0,0,0,0.5)] active:translate-y-px active:brightness-95 active:shadow-[0_1px_1px_rgba(255,255,255,0.25)_inset,0_-1px_1px_rgba(0,0,0,0.12)_inset,0_2px_8px_-4px_rgba(0,0,0,0.4)]",
        destructive:
          "bg-destructive text-destructive-foreground transition-[background-color,transform,box-shadow] duration-200 hover:bg-destructive/90 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-8px_rgba(0,0,0,0.5)] active:translate-y-px active:shadow-none",
        outline:
          "border border-input bg-background transition-[background-color,color,transform,box-shadow] duration-200 hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-8px_rgba(0,0,0,0.35)] active:translate-y-px active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground transition-[background-color,transform,box-shadow] duration-200 hover:bg-secondary/80 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-8px_rgba(0,0,0,0.4)] active:translate-y-px active:shadow-none",
        ghost:
          "transition-[background-color,color,transform] duration-200 hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5 active:translate-y-px",
        link: "text-primary underline-offset-4 hover:underline",
        /* The spec's other option for a primary action: "dark elevated
           glass" instead of a solid accent fill — for contexts where a
           solid accent button would compete with an already-accent-heavy
           surface. Only renders as actual glass under the Glass theme (its
           tokens are 0px blur everywhere else) — same restraint the rest of
           the material system already applies. */
        glass:
          "glass-surface-elevated text-[rgb(var(--c-s-50))] transition-[filter,transform] duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-px",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
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
  /**
   * Shows a spinner in place of the icon slot and disables the button.
   * No effect when `asChild` is set — Slot requires its single child
   * untouched, so a button standing in for a `<Link>` can't also grow a
   * spinner without breaking that contract; callers with a Link-as-button
   * that needs a loading state should handle it at the call site instead.
   */
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
            <MorphingSquare size={14} className="mr-2 shrink-0" />
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
