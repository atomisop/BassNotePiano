import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

// From the 21st.dev "Generate AI Button" (shadcnspace/button-33). The animated
// gradient border is split out as `AiBorder` so Atom's panel, bubbles and inputs
// can wear the exact same border; the button itself is unchanged apart from
// making its label, click handler and a few button props configurable.
export function AiBorder({
  rounded = "rounded-full",
  spin = true,
  spinClass = "size-40",
}: {
  rounded?: string;
  spin?: boolean;
  spinClass?: string;
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden bg-border ${rounded}`}>
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0%,transparent_35%,var(--color-blue-500)_50%,transparent_65%,transparent_85%,var(--color-orange-400)_100%)] ${spin ? "animate-spin" : ""} ${spinClass}`}
        style={spin ? { animationDuration: "2.5s" } : undefined}
      />
      <div className={`absolute inset-0.5 bg-background ${rounded}`} />
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
  className = "",
}: {
  label?: string;
  children?: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
  icon?: boolean;
  className?: string;
}) => {
  return (
    <Button
      variant="outline"
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative h-10 gap-2 overflow-hidden rounded-full border-transparent px-6 text-primary cursor-pointer ${className}`}
    >
      {/* Continuously animated gradient border */}
      <AiBorder />

      <span className="relative z-10 flex items-center justify-center gap-2">
        {icon && <Sparkles className="size-4" fill="currentColor" />}
        {children ?? label}
      </span>
    </Button>
  );
};

export default GenerateAIButton;
