import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_RECIPIENTS,
  MAX_RECENT,
  PERSON_ACTION_IDS,
  PERSON_ACTIONS,
  isPersonActionId,
  messageComposeHref,
  parseMessageRecipients,
  parseSlotParam,
  personActionHref,
  personActionLabel,
  personActionsFor,
  pushRecent,
} from "@/lib/commandRecents";

describe("command menu recents", () => {
  it("puts the newest first and drops a repeat of the same link", () => {
    const list = pushRecent([{ href: "/a", label: "A" }, { href: "/b", label: "B" }], { href: "/a", label: "A again" });
    expect(list.map((r) => r.href)).toEqual(["/a", "/b"]);
    expect(list[0].label).toBe("A again");
  });
  it("never keeps more than the limit", () => {
    let list: { href: string; label: string }[] = [];
    for (let i = 0; i < MAX_RECENT + 3; i++) list = pushRecent(list, { href: `/p${i}`, label: `P${i}` });
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].href).toBe(`/p${MAX_RECENT + 2}`);
  });
  it("builds a link that opens the student page with one job ready", () => {
    expect(personActionHref("u1", "credits")).toBe("/admin/users/u1?do=credits");
    expect(personActionHref("u1", "note")).toBe("/admin/users/u1?do=note");
  });
});

describe("jobs for one person", () => {
  it("knows every job the student page handles", () => {
    expect(PERSON_ACTION_IDS).toEqual(expect.arrayContaining(["credits", "book", "plan", "payments", "setup", "message", "note", "scale", "support", "discord"]));
    expect(isPersonActionId("scale")).toBe(true);
    expect(isPersonActionId("delete")).toBe(false);
    expect(isPersonActionId(null)).toBe(false);
  });
  it("offers every job for one person, the everyday ones for a few, and Set up plan only to the owner", () => {
    const one = personActionsFor(1, true).map((a) => a.id);
    expect(one).toEqual(expect.arrayContaining(["setup", "message", "note", "scale", "support"]));
    expect(personActionsFor(1, false).map((a) => a.id)).not.toContain("setup");
    const few = personActionsFor(3, true).map((a) => a.id);
    expect(few).toContain("message");
    expect(few).not.toContain("note");
    expect(few.length).toBeLessThan(one.length);
  });
  it("names the job with the person's first name", () => {
    const message = PERSON_ACTIONS.find((a) => a.id === "message")!;
    expect(personActionLabel(message, "Dana")).toBe("Message Dana");
    expect(PERSON_ACTIONS.every((a) => a.label.includes("{who}"))).toBe(true);
  });
  it("carries a weekly time into Set up plan and reads it back", () => {
    const href = personActionHref("u1", "setup", { slot: { scheduleId: "sched_1", chunkIndex: 2 } });
    expect(href).toBe("/admin/users/u1?do=setup&slot=sched_1:2");
    expect(parseSlotParam(new URL(href, "http://x").searchParams.get("slot"))).toEqual({ scheduleId: "sched_1", chunkIndex: 2 });
    // Only Set up plan takes a time.
    expect(personActionHref("u1", "book", { slot: { scheduleId: "s", chunkIndex: 1 } })).toBe("/admin/users/u1?do=book");
  });
  it("ignores a slot that is not an id and a number", () => {
    expect(parseSlotParam(null)).toBeNull();
    expect(parseSlotParam("abc")).toBeNull();
    expect(parseSlotParam(":3")).toBeNull();
    expect(parseSlotParam("abc:x")).toBeNull();
    expect(parseSlotParam("a b:1")).toBeNull();
    expect(parseSlotParam("abc:0")).toEqual({ scheduleId: "abc", chunkIndex: 0 });
  });
});

describe("messaging people picked on another screen", () => {
  it("links to the composer with them, once each, capped", () => {
    expect(messageComposeHref([])).toBe("/admin/messages");
    expect(messageComposeHref(["a", "b", "a"])).toBe("/admin/messages?to=a,b");
    const many = Array.from({ length: MAX_MESSAGE_RECIPIENTS + 5 }, (_, i) => `u${i}`);
    expect(new URL(messageComposeHref(many), "http://x").searchParams.get("to")!.split(",")).toHaveLength(MAX_MESSAGE_RECIPIENTS);
  });
  it("reads the list back, dropping anything that is not an id", () => {
    expect(parseMessageRecipients("a,b, a ,,<script>,c")).toEqual(["a", "b", "c"]);
    expect(parseMessageRecipients(["a,b", "c"])).toEqual(["a", "b", "c"]);
    expect(parseMessageRecipients(undefined)).toEqual([]);
    expect(parseMessageRecipients(Array.from({ length: 80 }, (_, i) => `u${i}`).join(","))).toHaveLength(MAX_MESSAGE_RECIPIENTS);
  });
});
