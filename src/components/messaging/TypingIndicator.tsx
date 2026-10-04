import { Typing } from "@/components/ui/typing";

/** Bouncing dots (21st.dev "Typing"), colored via the parent's text color. */
export function TypingIndicator({ className = "" }: { className?: string }) {
  return <Typing className={`h-2 w-6 ${className}`} />;
}
