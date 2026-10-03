"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * A real toggle-switch primitive — track + animated thumb — on
 * `@radix-ui/react-switch`, the same family as this project's other
 * primitives (`accordion`, `dialog`, `label`, `navigation-menu`, `sheet`).
 * Researched against 21st.dev's own switch references first (per the design
 * process this app follows): the strongest one used `@base-ui-components/
 * react`, a library not otherwise in this project — adding a second
 * primitives ecosystem for one component fails the "dependency cost /
 * consistency" test, so this adapts that reference's interaction pattern
 * (track + thumb, translate-x transition, focus ring, disabled state) onto
 * the primitive already in use everywhere else here.
 *
 * The off state goes through the same shadcn token bridge as `Button`/
 * `Input` (`bg-input`), so it retints correctly under every theme
 * automatically. The on/checked state reads the accent ramp directly
 * (`bg-amber-400`) instead of `bg-primary` — a toggle's checked state is
 * exactly the "selection state" signal green is back for, by direct
 * instruction, while `--primary` itself stays the neutral every real CTA
 * still reads (see globals.css's own `--primary` comment).
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-(--neu-edge) bg-neu-base p-0.5 shadow-pressed-low transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-neu-base shadow-raised-low ring-0 motion-safe:transition-[transform,background-color] data-[state=checked]:translate-x-5 data-[state=checked]:bg-signal data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
