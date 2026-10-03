import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

// From the 21st.dev "Generate AI Button" (shadcnspace/button-33), with the label
// and click handler made props.
const GenerateAIButton = ({
  label = "Ask AI",
  onClick,
  className = "",
}: {
  label?: string;
  onClick?: () => void;
  className?: string;
}) => {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={`relative h-10 gap-2 overflow-hidden rounded-full border-transparent px-6 text-primary cursor-pointer ${className}`}
    >
      {/* Continuously animated gradient border */}
      <div className="absolute inset-0 z-0 overflow-hidden rounded-full bg-border">
        <div
          className="absolute top-1/2 left-1/2 size-40 -translate-x-1/2 -translate-y-1/2 animate-spin bg-[conic-gradient(from_0deg,transparent_0%,transparent_35%,var(--color-blue-500)_50%,transparent_65%,transparent_85%,var(--color-orange-400)_100%)]"
          style={{ animationDuration: "2.5s" }}
        />
        <div className="absolute inset-0.5 rounded-full bg-background" />
      </div>

      <span className="relative z-10 flex items-center gap-2">
        <Sparkles className="size-4" fill="currentColor" />
        {label}
      </span>
    </Button>
  );
};

export default GenerateAIButton;
