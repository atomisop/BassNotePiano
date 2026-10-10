import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { DiscordBotTest } from "@/components/admin/DiscordBotTest";
import { DiscordMembersList } from "@/components/admin/DiscordMembersList";
import { createVisibleTestChannelAction, testDiscordBotAction } from "../schedule/actions";
import { disconnectDiscordForUserAction } from "./actions";

export const metadata = { title: "Admin: Discord" };

export default async function AdminDiscordPage() {
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, discordId: true, discordUsername: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Discord</h1>
      <p className="mt-2 max-w-[70ch] text-small text-slate-500">
        Class calls are made in Discord, so each student connects their account once. Here you can see who has and who has not, and
        disconnect anyone.
      </p>

      {isOwner && <DiscordBotTest onRun={testDiscordBotAction} onVisible={createVisibleTestChannelAction} />}

      <div className="mt-6">
        <DiscordMembersList
          rows={users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            isAdmin: u.role === "ADMIN",
            discordUsername: u.discordId ? (u.discordUsername ?? "Connected") : null,
          }))}
          onDisconnect={disconnectDiscordForUserAction}
        />
      </div>
    </div>
  );
}
