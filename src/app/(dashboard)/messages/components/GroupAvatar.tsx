import { Users } from "@/components/ui/appIcons";
export function GroupAvatar({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neu-base text-slate-50 shadow-raised-low ${className}`}
    >
      <Users className="h-[45%] w-[45%]" />
    </div>
  );
}
