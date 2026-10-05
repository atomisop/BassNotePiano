import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

// From the 21st.dev "Generate AI Button" (shadcnspace/button-33). The animated
// gradient border is split out as `AiBorder` so Atom's panel, bubbles and inputs
// can wear the exact same border; the button itself is unchanged apart from
// making its label, click handler and a few button props configurable.
// Kept faint on purpose: Atom and the Ask AI button sit on the app surface, so a hint of warmth is enough.
export const AI_HALO = "0 0 8px 0 rgb(251 138 92 / 0.14)";

export function AiBorder({
  rounded = "rounded-full",
  spin = true,
  spinClass = "size-40",
  surface = "bg-background",
  glow = false,
  plain = false,
  calm = false,
}: {
  rounded?: string;
  spin?: boolean;
  spinClass?: string;
  /** Fill inside the border. Atom passes the neumorphic base so its parts sit on the same surface as the app. */
  surface?: string;
  /** Still, even ring: the same blue and orange blended all the way around instead of a moving arc. */
  glow?: boolean;
  /** No gradient at all: just the neutral ring. */
  plain?: boolean;
  /** Solid, quiet ring that makes one slow orbit every 10 seconds and rests in between. */
  calm?: boolean;
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden bg-border ${rounded}`}>
      {(glow || calm) && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--color-orange-600),var(--color-amber-300),var(--color-orange-600))] opacity-25" />
      )}
      <div hidden={(glow && !calm) || plain}
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0%,transparent_35%,var(--color-orange-600)_50%,transparent_65%,transparent_85%,var(--color-amber-300)_100%)] ${calm ? "ai-orbit" : spin ? "animate-spin" : ""} ${spinClass}`}
        style={spin && !calm ? { animationDuration: "2.5s" } : undefined}
      />
      <div className={`absolute inset-0.5 ${surface} ${rounded}`} />
    </div>
  );
}

const GenerateAIButton = ({
  label = "Ask AI",
  children,
  onClick,
  type = "button",
  disabled,
  ariaLabel,
  icon = true,
  spin = true,
  glow = false,
  plain = false,
  calm = false,
  surface,
  className = "",
}: {
  label?: string;
  children?: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
  icon?: boolean;
  /** false = the gradient glow stays but holds still. */
  spin?: boolean;
  /** Still, smooth ambient glow all around the button (replaces the moving arc). */
  glow?: boolean;
  /** Neutral ring, no gradient (e.g. a send button with nothing to send yet). */
  plain?: boolean;
  /** Quiet version for the always-visible Ask AI button: one orbit every 10 seconds, a faint still glow the rest of the time. */
  calm?: boolean;
  surface?: string;
  className?: string;
}) => {
  return (
    <Button
      variant="outline"
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={
        calm
          ? { boxShadow: `var(--neu-raised-low), ${AI_HALO}` }
          : glow
          ? {
              boxShadow:
                `var(--neu-raised-low), ${AI_HALO}`,
            }
          : undefined
      }
      className={`relative h-10 gap-2 overflow-hidden rounded-full border-transparent px-6 text-primary cursor-pointer ${className}`}
    >
      {/* Continuously animated gradient border */}
      <AiBorder spin={spin} surface={surface} glow={glow} plain={plain} calm={calm} />

      <span className="relative z-10 flex items-center justify-center gap-2">
        {icon && <Sparkles className="size-4" fill="currentColor" />}
        {children ?? label}
      </span>
    </Button>
  );
};

export default GenerateAIButton;
