import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { DiscordBotTest } from "@/components/admin/DiscordBotTest";
import { DiscordMembersList } from "@/components/admin/DiscordMembersList";
import { createVisibleTestChannelAction, testDiscordBotAction } from "../schedule/actions";
import { disconnectDiscordForUserAction, notifyDiscordAction } from "./actions";
import { discordLinkState } from "@/lib/discordLinkState";

export const metadata = { title: "Admin: Discord" };

export default async function AdminDiscordPage() {
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, bannedAt: true, discordId: true, discordUsername: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <div>
      <div data-deck-header className="deck-header -mt-4 pt-4">
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Discord</h1>
      </div>
      <p className="mt-2 max-w-[70ch] text-small text-slate-500">
        Class calls are made in Discord, so each student connects their account once. Joining the server by the invite link does not connect them: they must press Connect Discord on their Lessons page. Here you can see who has and who has not, tell them how, and disconnect anyone.
      </p>

      {isOwner && <DiscordBotTest onRun={testDiscordBotAction} onVisible={createVisibleTestChannelAction} />}

      <div className="mt-6">
        <DiscordMembersList
          rows={users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            isAdmin: u.role === "ADMIN",
            banned: Boolean(u.bannedAt),
            discordUsername: discordLinkState({ discordId: u.discordId, discordUsername: u.discordUsername }).name,
          }))}
          onDisconnect={disconnectDiscordForUserAction}
          onNotify={notifyDiscordAction}
        />
      </div>
    </div>
  );
}
