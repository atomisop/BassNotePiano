import Link from "next/link";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { DiscordIcon } from "@/components/ui/icons";
import { unlinkDiscordAction } from "@/app/(dashboard)/lessons/discordActions";

const MESSAGES: Record<string, { text: string; good: boolean }> = {
  linked: { text: "Discord connected. Your private class call will appear before each class.", good: true },
  taken: { text: "That Discord account is already connected to someone else.", good: false },
  denied: { text: "Discord was not connected. You can try again.", good: false },
  error: { text: "Something went wrong connecting Discord. Please try again.", good: false },
};

/** Lets a student connect Discord, which is how their private class call knows who to let in. */
export function DiscordConnectCard({ discordUsername, flag }: { discordUsername: string | null; flag?: string }) {
  const message = flag ? MESSAGES[flag] : undefined;
  return (
    <div className="mx-auto mb-4 w-full max-w-wide rounded-2xl bg-neu-base p-4 shadow-raised-low">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DiscordIcon size={22} className="text-[#5865F2]" />
          <div>
            <p className="text-small font-semibold text-slate-50">{discordUsername ? `Discord: ${discordUsername}` : "Connect Discord"}</p>
            <p className="text-small text-slate-500">{discordUsername ? "Your class call is made for you." : "Needed for your private class call."}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {discordUsername ? (
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
          <Link href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
            Join the server
          </Link>
        </div>
      </div>
      {message && <p className={`mt-3 text-small ${message.good ? "text-slate-300" : "text-red-400"}`}>{message.text}</p>}
    </div>
  );
}
