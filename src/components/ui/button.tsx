import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { MorphingSquare } from "@/components/ui/morphing-square"

/**
 * The one button for the whole app: the glass button of the 21st.dev "Liquid Glass Login" component (Rule 1 in
 * docs/glass-revamp/DESIGN-SYSTEM.md). The look lives in globals.css ("Liquid glass everywhere"): a glass layer behind the label
 * (white tint 0.07, or the signal colour at 0.34 for the main action, red at 0.34 for destructive), the button shadow with its bright
 * top edge, a white overlay on hover (0.10) and press (0.15, with a dip to 0.98), a soft label shadow and a 2px focus ring.
 *
 * `default` (alias `primary`) is the screen section's ONE main action. `danger` stays SOLID red on purpose: it is the last,
 * irreversible step of a destructive flow. `link` is an inline text link.
 */
const lift = "press"

const primary = cn("liquid-signal relative font-semibold", lift)

const buttonCva = cva(
  "tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-small font-medium ring-offset-background focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: primary,
        primary,
        paper: cn("liquid relative text-slate-50 font-semibold", lift),
        secondary: cn("liquid text-slate-50", lift),
        outline: cn("liquid text-slate-100", lift),
        ghost: cn("liquid text-slate-200 hover:text-slate-50", lift),
        destructive: cn("liquid text-slate-50", lift),
        // Solid red: only for the final, irreversible step of a destructive flow (kept solid on purpose, Rule 1).
        danger: cn("relative bg-red-600 text-white font-semibold hover:brightness-110 active:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", lift),
        link: "text-signal-fg underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        glass: cn("liquid text-slate-50", lift),
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        // The source's main action is 52px tall.
        lg: "h-13 px-6 text-body",
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

/**
 * cva only joins strings, so a caller's override such as `className: "text-red-300"` on a ghost button used to lose to the variant's own
 * `text-slate-300` (whichever rule the stylesheet happened to print last won). Every quiet red "Cancel" in the app rendered gray because of
 * it. Running the result through `cn` (tailwind-merge) makes the caller's class always win.
 */
const buttonVariants = (props?: Parameters<typeof buttonCva>[0]) => cn(buttonCva(props))

/**
 * The variants that are glass (every one but the solid `danger` and the text `link`). The Button says so with data-glass-role="button",
 * which the glass engine and the CSS read. tests/glassButtonRoles.test.ts keeps this list in step with the classes above.
 */
export const GLASS_BUTTON_VARIANTS: ReadonlyArray<NonNullable<VariantProps<typeof buttonVariants>["variant"]>> = [
  "default",
  "primary",
  "paper",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "glass",
]

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
        data-glass-role={GLASS_BUTTON_VARIANTS.includes(variant ?? "default") ? "button" : undefined}
        data-glass-tone={variant === "destructive" ? "danger" : variant === "default" || variant === "primary" || variant == null ? "primary" : undefined}
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
