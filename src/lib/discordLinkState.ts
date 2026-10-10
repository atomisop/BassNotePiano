/**
 * Whether someone has connected Discord, decided ONE way everywhere: by the stored Discord id. The name is only for show.
 * The lessons card, the settings card, the banner, the admin Discord list and the class-call job all read this, so one can
 * never say "Connect" while another says "Disconnect".
 */
export interface DiscordLinkState {
  connected: boolean;
  /** The Discord name to show; "Connected" when only the id is known. Null when not connected. */
  name: string | null;
}

export function discordLinkState(user: { discordId: string | null; discordUsername: string | null }): DiscordLinkState {
  if (!user.discordId) return { connected: false, name: null };
  return { connected: true, name: user.discordUsername?.trim() || "Connected" };
}
