import Link from "next/link";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { DiscordIcon } from "@/components/ui/icons";
import { unlinkDiscordAction } from "@/app/(dashboard)/lessons/discordActions";
import type { DiscordLinkState } from "@/lib/discordLinkState";
import { buttonVariants } from "@/components/ui/button";

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
        <div className="flex items-start gap-3">
          <DiscordIcon size={22} className="mt-0.5 shrink-0 text-[#5865F2]" />
          <div>
            <p className="text-small font-semibold text-slate-50">{link.connected ? `Discord: ${discordUsername}` : "Connect Discord"}</p>
            <p className="text-small text-slate-500">{link.connected ? "Your class call is made for you." : "Needed for your private class call. Joining the server by the invite alone does not connect you: press Connect Discord."}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {link.connected ? (
            <form action={unlinkDiscordAction}>
              <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Disconnect
              </button>
            </form>
          ) : (
            <a href="/api/discord/connect" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Connect Discord
            </a>
          )}
          {/* Connecting already puts you in the server. The invite is only for someone connected who is not in it yet. */}
          {link.connected && flag === "linked-nojoin" && (
            <Link href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Join the server
            </Link>
          )}
        </div>
      </div>
      {message && <p className={`mt-3 text-small ${message.good ? "text-slate-300" : "text-red-400"}`}>{message.text}</p>}
    </div>
  );
}
