import { describe, expect, it } from "vitest";
import { movedMarker, peopleToMove } from "@/lib/discordMove";

describe("who still has to be pulled into a call", () => {
  const calls = [{ channelId: "c1", studentDiscordIds: ["s1"] }];

  it("includes the student and the owner", () => {
    const t = peopleToMove(calls, "owner", new Set());
    expect(t).toEqual([
      { channelId: "c1", discordId: "s1" },
      { channelId: "c1", discordId: "owner" },
    ]);
  });

  it("leaves out the owner when there is no owner id", () => {
    expect(peopleToMove(calls, null, new Set())).toEqual([{ channelId: "c1", discordId: "s1" }]);
  });

  it("skips anyone already moved into that call, but not into another one", () => {
    const done = new Set([movedMarker("c1", "s1"), movedMarker("c1", "owner")]);
    expect(peopleToMove(calls, "owner", done)).toEqual([]);
    expect(peopleToMove([{ channelId: "c2", studentDiscordIds: ["s1"] }], "owner", done)).toHaveLength(2);
  });

  it("lists a person once per call even if two bookings share it", () => {
    const t = peopleToMove([{ channelId: "c1", studentDiscordIds: ["s1", "s1", "s2"] }], null, new Set());
    expect(t.map((x) => x.discordId)).toEqual(["s1", "s2"]);
  });
});
