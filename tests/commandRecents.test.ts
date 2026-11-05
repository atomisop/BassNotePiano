import { describe, expect, it } from "vitest";
import { MAX_RECENT, personActionHref, pushRecent } from "@/lib/commandRecents";

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
  });
});
