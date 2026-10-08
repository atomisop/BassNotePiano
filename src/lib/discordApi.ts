import { DISCORD_CLASS_CATEGORY_ID, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } from "@/lib/discord";

// The few Discord calls the class-call bot needs. The bot token is read from
// the environment (DISCORD_BOT_TOKEN) and never logged.

const API = "https://discord.com/api/v10";

// Permission bits, as Discord numbers them.
const VIEW_CHANNEL = 1 << 10;
const CONNECT = 1 << 20;
const SPEAK = 1 << 21;
const VIDEO = 1 << 9;
const USE_VOICE_ACTIVITY = 1 << 25;
const SEND_MESSAGES = 1 << 11;
const READ_MESSAGE_HISTORY = 1 << 16;
const MANAGE_CHANNELS = 1 << 4;

/**
 * What the bot keeps on its own channels. Hiding a channel from @everyone also
 * hides it from the bot, unless the bot has its own entry, so without this it
 * could create a class call but never see or remove it. A bot user has the same
 * id as its application. Discord only lets a bot hand out permissions it holds
 * in the server itself, so this asks for the least that works first (see-and-
 * manage), then for just seeing it, and the caller falls back to neither.
 */
const BOT_PERMISSION_TRIES = [String(VIEW_CHANNEL | MANAGE_CHANNELS), String(VIEW_CHANNEL), null] as const;

/** What a student or the teacher may do inside their class call. */
export const CLASS_MEMBER_PERMISSIONS = String(VIEW_CHANNEL | CONNECT | SPEAK | VIDEO | USE_VOICE_ACTIVITY | SEND_MESSAGES | READ_MESSAGE_HISTORY);

function token(): string {
  const value = process.env.DISCORD_BOT_TOKEN;
  if (!value) throw new Error("DISCORD_BOT_TOKEN is not set");
  return value;
}

async function discordFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 429 && !retried) {
    const wait = Number((await res.json().catch(() => ({}))).retry_after ?? 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(5, Math.max(0.5, wait)) * 1000));
    return discordFetch(path, init, true);
  }
  return res;
}

/** A readable voice channel name, such as "Class: Meshesha, 5 PM". */
export function classChannelName(names: string[], when: Date): string {
  const time = when.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const who = names
    .map((n) => n.trim().split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 3)
    .join(" and ");
  return `Class: ${who || "Student"}, ${time}`.slice(0, 100);
}

/** Whether this Discord account is in the server. A person who is not cannot be given a private channel. */
export async function isGuildMember(discordId: string): Promise<boolean> {
  const res = await discordFetch(`/guilds/${DISCORD_GUILD_ID}/members/${discordId}`);
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new Error(`Discord member check failed (${res.status})`);
}

/** Makes a private voice channel under the Live Classes category that only these people can see, and returns its id. */
export async function createClassChannel(name: string, memberDiscordIds: string[]): Promise<string> {
  let lastError = "";
  for (const botPermissions of BOT_PERMISSION_TRIES) {
    const res = await discordFetch(`/guilds/${DISCORD_GUILD_ID}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name,
        type: 2,
        parent_id: DISCORD_CLASS_CATEGORY_ID,
        permission_overwrites: [
          // @everyone has the same id as the server, and cannot even see the channel.
          { id: DISCORD_GUILD_ID, type: 0, allow: "0", deny: String(VIEW_CHANNEL) },
          ...(botPermissions ? [{ id: DISCORD_CLIENT_ID, type: 1, allow: botPermissions, deny: "0" }] : []),
          ...memberDiscordIds.map((id) => ({ id, type: 1, allow: CLASS_MEMBER_PERMISSIONS, deny: "0" })),
        ],
      }),
    });
    if (res.ok) return ((await res.json()) as { id: string }).id;
    lastError = `Discord channel create failed (${res.status}): ${(await res.text()).slice(0, 200)}`;
    // Missing Permissions (403) means the bot asked to hand out something it does not hold: try a smaller request.
    if (res.status !== 403) break;
  }
  throw new Error(lastError);
}

/** Removes a class channel. Already gone counts as done. */
export async function deleteChannel(channelId: string): Promise<void> {
  const res = await discordFetch(`/channels/${channelId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Discord channel delete failed (${res.status})`);
}

export interface SetupCheck {
  step: string;
  ok: boolean;
  detail: string;
}

/** Walks through everything the bot needs, so the owner can see what is wrong instead of guessing. */
export async function checkBotSetup(ownerDiscordId: string | null): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = [];
  const add = (step: string, ok: boolean, detail: string) => checks.push({ step, ok, detail });

  if (!process.env.DISCORD_BOT_TOKEN) {
    add("Bot token", false, "DISCORD_BOT_TOKEN is not set in Netlify, or the site has not been redeployed since you added it.");
    return checks;
  }
  add("Bot token", true, "Found.");

  try {
    const guild = await discordFetch(`/guilds/${DISCORD_GUILD_ID}`);
    add("Server", guild.ok, guild.ok ? "The bot can see your server." : `Discord said ${guild.status}. The bot may not be in the server yet.`);
    if (!guild.ok) return checks;

    const category = await discordFetch(`/channels/${DISCORD_CLASS_CATEGORY_ID}`);
    add("Live Classes category", category.ok, category.ok ? "Found." : `Discord said ${category.status}. Check the category ID and that the bot can view it.`);
    if (!category.ok) return checks;

    if (!ownerDiscordId) {
      add("Your Discord", false, "Connect your own Discord on the Lessons page first, so you are given access to each call.");
      return checks;
    }
    const member = await isGuildMember(ownerDiscordId);
    add("You are in the server", member, member ? "Yes." : "Your connected Discord account is not in the server.");
    if (!member) return checks;

    const id = await createClassChannel("Bot test (deleting)", [ownerDiscordId]);
    add("Create a private channel", true, "A test channel was created.");
    await deleteChannel(id);
    add("Remove it again", true, "The test channel was deleted.");
  } catch (err) {
    add("Discord", false, err instanceof Error ? err.message.slice(0, 200) : "Something went wrong.");
  }
  return checks;
}

/**
 * Adds a person to the server right after they connect their Discord, using the
 * short-lived token Discord gave us at sign-in. The token is used once and never
 * stored. Needs the bot to have the Create Instant Invite permission.
 */
export async function addToGuild(discordId: string, accessToken: string): Promise<"added" | "already" | "failed"> {
  const res = await discordFetch(`/guilds/${DISCORD_GUILD_ID}/members/${discordId}`, {
    method: "PUT",
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (res.status === 201) return "added";
  if (res.status === 204) return "already";
  return "failed";
}

export const TEST_CHANNEL_KEY = "discord_test_channel";
const DEFAULT_TEST_CHANNEL_MINUTES = 10;

/**
 * Makes a visible test call for the owner and leaves it for a few minutes, so
 * the owner can see it in Discord. The channel id is remembered in AppSetting
 * and the class-channel job removes it after the time is up.
 */
export async function createLingeringTestChannel(
  ownerDiscordId: string,
  remember: (value: string) => Promise<void>,
  minutes: number = DEFAULT_TEST_CHANNEL_MINUTES,
): Promise<string> {
  const id = await createClassChannel(`Test call (removed in ${minutes} minutes)`, [ownerDiscordId]);
  await remember(`${id}|${Date.now() + minutes * 60_000}`);
  return id;
}

export type MoveResult = "moved" | "not_in_voice" | "failed";

/**
 * Pulls a person into a voice channel. Discord only allows this for someone who is
 * already connected to a voice channel somewhere in the server (a bot cannot make a
 * disconnected person join), and it needs the bot to have the Move Members permission.
 * "not_in_voice" is the normal answer for anyone who has not opened Discord voice yet.
 */
export async function moveToVoiceChannel(discordId: string, channelId: string): Promise<MoveResult> {
  const res = await discordFetch(`/guilds/${DISCORD_GUILD_ID}/members/${discordId}`, {
    method: "PATCH",
    body: JSON.stringify({ channel_id: channelId }),
  });
  if (res.ok) return "moved";
  // 40032: "Target user is not connected to voice."
  const body = (await res.json().catch(() => ({}))) as { code?: number };
  return res.status === 400 && body.code === 40032 ? "not_in_voice" : "failed";
}
