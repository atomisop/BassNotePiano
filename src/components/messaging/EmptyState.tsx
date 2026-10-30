import { MessageSquare } from "@/components/ui/appIcons";
export function EmptyState() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neu-base text-slate-500 shadow-raised-mid">
        <MessageSquare className="h-9 w-9" />
      </div>
      <div>
        <p className="text-body font-semibold text-slate-200">Your messages</p>
      </div>
    </div>
  );
}
