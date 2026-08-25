import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";

/**
 * HOMEPAGE — Discord community plug, sitting right after ClassesOverview.
 *
 * Pitched as the community/practice space between classes ("share clips,
 * ask questions"), not a claim about which platform the live session itself
 * runs on. ClassesOverview just above this still says "Live on Zoom", and
 * this is deliberately worded so it doesn't contradict that regardless of
 * how that question eventually gets resolved.
 *
 * direction="up": ClassesOverview (left) sits right before this and
 * PricingCallout (right) right after, so "up" avoids repeating either
 * neighbor's slide-in direction.
 */
export function DiscordCommunityCallout() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-12 md:pb-28">
      <ScrollGlassCard
        className="flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-center sm:justify-between md:p-12"
        direction="up"
      >
        <div className="flex items-start gap-4 sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-a-400)/0.15)] text-[rgb(var(--c-a-300))]">
            <DiscordIcon size={24} />
          </span>
          <div>
            <p className="label label-muted">Community</p>
            <h2 className="mt-1.5 font-serif text-2xl text-slate-50 sm:text-3xl">Join us on Discord</h2>
            <p className="mt-2 max-w-md text-sm text-slate-300">
              Share practice clips, ask questions between classes, and meet other students learning
              the kiñit scales.
            </p>
          </div>
        </div>
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary inline-flex shrink-0 items-center gap-2"
        >
          <DiscordIcon size={16} />
          Join the Discord
        </a>
      </ScrollGlassCard>
    </section>
  );
}
