import Link from "next/link";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { DiscordIcon } from "@/components/ui/icons";
import { unlinkDiscordAction } from "@/app/(dashboard)/lessons/discordActions";
import type { DiscordLinkState } from "@/lib/discordLinkState";

const MESSAGES: Record<string, { text: string; good: boolean }> = {
  linked: { text: "Discord connected, and you are in the server. Your private class call opens a few minutes before each class.", good: true },
  "linked-nojoin": { text: "Discord connected. Tap Join the server to come in, then your class call will appear before each class.", good: true },
  taken: { text: "That Discord account is already connected to someone else.", good: false },
  denied: { text: "Discord was not connected. You can try again.", good: false },
  error: { text: "Something went wrong connecting Discord. Please try again.", good: false },
};

/** Lets a student connect Discord, which is how their private class call knows who to let in. */
export function DiscordConnectCard({ link, flag }: { link: DiscordLinkState; flag?: string }) {
  const message = flag ? MESSAGES[flag] : undefined;
  const discordUsername = link.name;
  return (
    <div className="mx-auto mb-4 w-full max-w-wide rounded-2xl bg-neu-base p-4 shadow-raised-low">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DiscordIcon size={22} className="text-[#5865F2]" />
          <div>
            <p className="text-small font-semibold text-slate-50">{link.connected ? `Discord: ${discordUsername}` : "Connect Discord"}</p>
            <p className="text-small text-slate-500">{link.connected ? "Your class call is made for you." : "Needed for your private class call. Joining the server by the invite alone does not connect you: press Connect Discord."}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {link.connected ? (
            <form action={unlinkDiscordAction}>
              <button type="submit" className="tap neu-btn rounded-lg px-3 py-1.5 text-small font-medium">
                Disconnect
              </button>
            </form>
          ) : (
            <a href="/api/discord/connect" className="tap cta-sheen cta-fill inline-flex items-center rounded-lg px-3 py-1.5 text-small font-semibold">
              Connect Discord
            </a>
          )}
          {/* Connecting already puts you in the server. The invite is only for someone connected who is not in it yet. */}
          {link.connected && flag === "linked-nojoin" && (
            <Link href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
              Join the server
            </Link>
          )}
        </div>
      </div>
      {message && <p className={`mt-3 text-small ${message.good ? "text-slate-300" : "text-red-400"}`}>{message.text}</p>}
    </div>
  );
}
