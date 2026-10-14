import { describe, expect, it } from "vitest";
import { discordAppAddress } from "@/components/ui/DiscordLink";

describe("discordAppAddress", () => {
  it("turns invites and channel links into discord:// addresses", () => {
    expect(discordAppAddress("https://discord.gg/A6Qhk8guyj")).toBe("discord://discord.com/invite/A6Qhk8guyj");
    expect(discordAppAddress("https://discord.com/channels/1/2")).toBe("discord://discord.com/channels/1/2");
    expect(discordAppAddress("https://discord.com/oauth2/authorize?client_id=1&state=x")).toBe("discord://discord.com/oauth2/authorize?client_id=1&state=x");
  });
  it("leaves other addresses alone", () => {
    expect(discordAppAddress("https://example.com/x")).toBeNull();
    expect(discordAppAddress("not a url")).toBeNull();
  });
});
