import { describe, expect, it } from "vitest";
import { ADMIN_NOTIFICATION_GROUPS, ADMIN_NOTIFICATION_KINDS } from "@/lib/adminNotificationKinds";

describe("admin notification kinds", () => {
  it("every alert belongs to a known group and kinds are unique", () => {
    const kinds = ADMIN_NOTIFICATION_KINDS.map((k) => k.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of ADMIN_NOTIFICATION_KINDS) expect(ADMIN_NOTIFICATION_GROUPS).toContain(k.group);
  });
  it("new account alerts are for the owner only and off for staff by default", () => {
    for (const kind of ["NEW_ACCOUNT", "ACCOUNT_VERIFIED"]) {
      const row = ADMIN_NOTIFICATION_KINDS.find((k) => k.kind === kind);
      expect(row?.ownerOnly).toBe(true);
      expect(row?.defaultOn).toBe(false);
    }
  });
});
