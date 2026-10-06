import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { classChannelName, createClassChannel, deleteChannel, isGuildMember, CLASS_MEMBER_PERMISSIONS } from "@/lib/discordApi";
import { DISCORD_CLASS_CATEGORY_ID, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } from "@/lib/discord";
import { checkState, makeState } from "@/lib/discordLink";

beforeAll(() => {
  process.env.DISCORD_BOT_TOKEN = "test-token";
  process.env.NEXTAUTH_SECRET = "test-secret";
});
afterEach(() => vi.restoreAllMocks());

describe("class channel name", () => {
  it("uses first names and the Eastern time", () => {
    expect(classChannelName(["Meshesha Tadesse"], new Date("2026-11-05T22:00:00Z"))).toBe("Class: Meshesha, 5:00 PM");
    expect(classChannelName(["A B", "C D"], new Date("2026-11-05T22:00:00Z"))).toBe("Class: A and C, 5:00 PM");
  });
});

describe("createClassChannel", () => {
  it("makes a private voice channel under the category that only the listed people can open", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "999" }), { status: 201 }));
    const id = await createClassChannel("Class: Test", ["111", "222"]);
    expect(id).toBe("999");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/guilds/${DISCORD_GUILD_ID}/channels`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.type).toBe(2);
    expect(body.parent_id).toBe(DISCORD_CLASS_CATEGORY_ID);
    // @everyone cannot see it, and each person is allowed in.
    expect(body.permission_overwrites[0]).toMatchObject({ id: DISCORD_GUILD_ID, type: 0, deny: String(1 << 10) });
    // The bot keeps its own access, so it can still remove the channel afterwards.
    const bot = body.permission_overwrites[1];
    expect(bot).toMatchObject({ id: DISCORD_CLIENT_ID, type: 1 });
    expect(Number(bot.allow) & (1 << 4)).toBeTruthy(); // Manage Channels
    expect(Number(bot.allow) & (1 << 10)).toBeTruthy(); // View Channel
    expect(body.permission_overwrites.slice(2).map((o: { id: string; allow: string }) => [o.id, o.allow])).toEqual([
      ["111", CLASS_MEMBER_PERMISSIONS],
      ["222", CLASS_MEMBER_PERMISSIONS],
    ]);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bot test-token" });
  });
  it("raises a clear error when Discord refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Missing Permissions", { status: 403 }));
    await expect(createClassChannel("x", ["1"])).rejects.toThrow(/403/);
  });
});

describe("member check and delete", () => {
  it("tells a member from a non-member", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await isGuildMember("1")).toBe(true);
    expect(await isGuildMember("2")).toBe(false);
  });
  it("treats an already-removed channel as done", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(deleteChannel("5")).resolves.toBeUndefined();
  });
});

describe("Discord connect state", () => {
  it("only accepts the state made for this user and this browser", () => {
    const { nonce, state } = makeState("user-1");
    expect(checkState(state, nonce, "user-1")).toBe(true);
    expect(checkState(state, nonce, "user-2")).toBe(false);
    expect(checkState(state, "other-nonce", "user-1")).toBe(false);
    expect(checkState(null, nonce, "user-1")).toBe(false);
    expect(checkState(`${nonce}.forged`, nonce, "user-1")).toBe(false);
  });
});
