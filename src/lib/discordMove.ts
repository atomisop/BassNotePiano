/**
 * Who still has to be pulled into their class call. Discord only lets the bot move someone who is already connected
 * to a voice channel somewhere in the server, so a person who joins voice after the call opened has to be tried again.
 * Each person is moved once: after that they are left alone, so someone who steps out is not dragged back.
 */
export interface LiveCall {
  channelId: string;
  /** Discord ids of the students in the class. */
  studentDiscordIds: string[];
}

export interface MoveTarget {
  channelId: string;
  discordId: string;
}

export function peopleToMove(calls: LiveCall[], ownerDiscordId: string | null, alreadyMoved: Set<string>): MoveTarget[] {
  const out: MoveTarget[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    const ids = new Set(call.studentDiscordIds.filter(Boolean));
    if (ownerDiscordId) ids.add(ownerDiscordId);
    for (const discordId of Array.from(ids)) {
      const key = movedMarker(call.channelId, discordId);
      if (alreadyMoved.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ channelId: call.channelId, discordId });
    }
  }
  return out;
}

/** The AppSetting key that records a person was moved into a call. */
export function movedMarker(channelId: string, discordId: string): string {
  return `discord_moved:${channelId}:${discordId}`;
}
