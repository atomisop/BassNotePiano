import { PushPin } from "@/components/ui/appIcons";
export function PinIcon({ filled = false, className = "h-3.5 w-3.5" }: { filled?: boolean; className?: string }) {
  return (
    <PushPin className={className} />
  );
}
