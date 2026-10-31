import { MessageSquare } from "@/components/ui/appIcons";
export function EmptyState() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <MessageSquare className="h-8 w-8 text-slate-600" aria-hidden />
      <div>
        <p className="text-body font-semibold text-slate-200">Pick a conversation</p>
        <p className="mt-1 text-small text-slate-500">Your chats with friends, groups and the studio open here.</p>
      </div>
    </div>
  );
}
