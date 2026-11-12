import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { DiscordBotTest } from "@/components/admin/DiscordBotTest";
import { DiscordMembersList } from "@/components/admin/DiscordMembersList";
import { createVisibleTestChannelAction, testDiscordBotAction } from "../schedule/actions";
import { disconnectDiscordForUserAction, notifyDiscordAction } from "./actions";
import { discordLinkState } from "@/lib/discordLinkState";

export async function DiscordView() {
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, bannedAt: true, discordId: true, discordUsername: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <div>
      <h1 className="sr-only">Discord</h1>

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
