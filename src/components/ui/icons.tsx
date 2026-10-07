import { cn } from "@/lib/utils";

/**
 * Shared inline icons.
 *
 * These exist because the same two marks kept being re-typed as literal
 * characters, "✓" in four different files, which the design system's
 * pre-delivery checklist rules out ("No emoji-as-icon, SVG only"). The
 * practical problem with a text checkmark isn't taste: it renders in whatever
 * fallback face the OS picks, so its weight and baseline don't match the
 * surrounding type, and it is read aloud by screen readers as "check mark"
 * in the middle of a sentence.
 *
 * All of these are `aria-hidden`, they are always decorative here, sitting
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
 * ignore it, the other three are static marks.
 *
 * Stroked in `currentColor`, not a hardcoded gradient, a loading spinner
 * is a state indicator, not a call-to-action, and this app's "accent only
 * on true CTAs" instruction means it no longer carries its own persistent
 * house identity the way it briefly did; it just inherits whatever
 * foreground color already surrounds it (near-black text-on-accent inside
 * a real CTA button, a plain neutral everywhere else), same as any other
 * icon here. Atom's own icon (`loader-15.tsx`) is a separate, deliberately
 * branded component and unaffected by this, see that file's own comment.
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

export function XIcon({ className, size = 14 }: { className?: string; size?: number }) {
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
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Show-password toggle, "visible" state. */
export function EyeIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Show-password toggle, "hidden" state, matching EyeIcon's own outline plus a strike-through rather than an unrelated glyph. */
export function EyeOffIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M9.9 5.2A10.7 10.7 0 0112 5c7 0 10.5 7 10.5 7a13.5 13.5 0 01-3.1 3.9M6.5 6.6C3.6 8.4 1.5 12 1.5 12s3.5 7 10.5 7c1.4 0 2.7-.28 3.9-.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Discord's own logomark (the "Clyde" mark), a filled shape rather than a
 * stroke like the icons above, matches the path Discord's brand guidelines
 * publish and the widely-used Simple Icons rendering of it, so it reads as
 * the real mark rather than an approximation.
 */
export function DiscordIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

export function ReplyArrowIcon({ className, size = 14 }: { className?: string; size?: number }) {
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
      <path d="M9 17 4 12l5-5M4 12h11a5 5 0 0 1 5 5v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SmileyPlusIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden
    >
      <path d="M8.5 10.5v.01M13.5 10.5v.01" strokeLinecap="round" />
      <path d="M8 15c.8 1 1.9 1.5 3 1.5s2.2-.5 3-1.5" strokeLinecap="round" />
      <path d="M14.5 3.5A9 9 0 1 0 20.5 9.5" strokeLinecap="round" />
      <path d="M18 2v5M15.5 4.5h5" strokeLinecap="round" />
    </svg>
  );
}
