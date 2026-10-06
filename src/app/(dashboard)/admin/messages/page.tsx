import { listSentAdminMessages } from "@/lib/mail";
import { MessageComposer } from "@/components/admin/MessageComposer";

export default async function AdminMessagesPage() {
  const sent = await listSentAdminMessages();

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Messages</h1>

      <div className="mt-8">
        <MessageComposer
          sent={sent.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
