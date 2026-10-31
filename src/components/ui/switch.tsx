"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * A real toggle-switch primitive, track + animated thumb, on
 * `@radix-ui/react-switch`, the same family as this project's other
 * primitives (`accordion`, `dialog`, `label`, `navigation-menu`, `sheet`).
 * Researched against 21st.dev's own switch references first (per the design
 * process this app follows): the strongest one used `@base-ui-components/
 * react`, a library not otherwise in this project, adding a second
 * primitives ecosystem for one component fails the "dependency cost /
 * consistency" test, so this adapts that reference's interaction pattern
 * (track + thumb, translate-x transition, focus ring, disabled state) onto
 * the primitive already in use everywhere else here.
 *
 * Off is a visible track with a small orange dot; on is a full orange track with a white knob flipped to the right (see the
 * constants below). Both states read in either theme because the off track is a tint of the theme's own text color.
 */
// One look for every on/off switch in the app (2026-10-31, the owner's request): off is a visible track with a small orange dot on the left;
// on is a full orange track with the dot grown into a white knob, flipped to the right. Hand-built switches draw the same thing with SwitchLook.
const TRACK =
  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 ring-1 ring-inset motion-safe:transition-colors motion-safe:duration-200"
const TRACK_OFF = "bg-slate-50/12 ring-slate-50/20"
const TRACK_ON = "bg-signal ring-signal"
// Transform only: the knob is always 20px, shown at 45% (the dot) when off, so the flip is one smooth scale and slide.
const KNOB =
  "pointer-events-none block h-5 w-5 rounded-full motion-safe:transition-[transform,background-color] motion-safe:duration-300 [transition-timing-function:cubic-bezier(0.2,1.15,0.3,1)]"
const KNOB_OFF = "translate-x-0 scale-[0.45] bg-signal"
const KNOB_ON = "translate-x-5 scale-100 bg-white shadow-[0_1px_3px_rgb(0_0_0/0.35)]"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      TRACK,
      "peer cursor-pointer before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] data-[state=unchecked]:bg-slate-50/12 data-[state=unchecked]:ring-slate-50/20 data-[state=checked]:bg-signal data-[state=checked]:ring-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        KNOB,
        "data-[state=unchecked]:translate-x-0 data-[state=unchecked]:scale-[0.45] data-[state=unchecked]:bg-signal data-[state=checked]:translate-x-5 data-[state=checked]:scale-100 data-[state=checked]:bg-white data-[state=checked]:shadow-[0_1px_3px_rgb(0_0_0/0.35)]"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

/** The same switch drawn inside a hand-built control (a button that carries its own label and role="switch"). Decorative only. */
function SwitchLook({ on, className }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn(TRACK, on ? TRACK_ON : TRACK_OFF, className)}>
      <span className={cn(KNOB, on ? KNOB_ON : KNOB_OFF)} />
    </span>
  )
}

export { Switch, SwitchLook }
