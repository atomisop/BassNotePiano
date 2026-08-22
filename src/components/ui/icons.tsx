import { cn } from "@/lib/utils";

/**
 * Shared inline icons.
 *
 * These exist because the same two marks kept being re-typed as literal
 * characters — "✓" in four different files — which the design system's
 * pre-delivery checklist rules out ("No emoji-as-icon — SVG only"). The
 * practical problem with a text checkmark isn't taste: it renders in whatever
 * fallback face the OS picks, so its weight and baseline don't match the
 * surrounding type, and it is read aloud by screen readers as "check mark"
 * in the middle of a sentence.
 *
 * All of these are `aria-hidden` — they are always decorative here, sitting
 * beside text that already carries the meaning.
 */

export function CheckIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={className}
      aria-hidden
    >
      <path d="M5 12l5 5L19 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * `motion-safe:animate-spin` rather than a bare `animate-spin`: a loading
 * button is exactly the "repetitive movement" `prefers-reduced-motion`
 * exists to suppress, and this is otherwise the one icon here that would
 * ignore it — the other three are static marks.
 */
export function SpinnerIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("motion-safe:animate-spin", className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowLeftIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
