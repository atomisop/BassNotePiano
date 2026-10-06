/**
 * Single source for the Discord invite link, so it's not hand-typed in
 * every place it's advertised (the navbar, the footer, the homepage
 * callout, and the dismissible notification card). Change it once here
 * if the invite is ever regenerated.
 */
export const DISCORD_INVITE_URL = "https://discord.gg/A6Qhk8guyj";

/** The Discord application and server the class-call bot works in. None of these are secret. */
export const DISCORD_CLIENT_ID = "1557088325414690846";
export const DISCORD_GUILD_ID = "1541622647723655188";
/** The private "Live Classes" category each class call is created under. */
export const DISCORD_CLASS_CATEGORY_ID = "1557094119568834642";

/** Where a class call opens in Discord. */
export function discordChannelUrl(channelId: string): string {
  return `https://discord.com/channels/${DISCORD_GUILD_ID}/${channelId}`;
}
