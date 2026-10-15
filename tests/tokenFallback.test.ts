import { describe, expect, it } from "vitest";
import type { JWT } from "next-auth/jwt";
import { tokenWhenEntitlementsUnknown } from "@/lib/tokenFallback";

const tok = (extra: Partial<JWT> = {}) => ({ sub: "u1", ...extra }) as JWT;

describe("entitlements unknown (database slow)", () => {
  it("a refresh keeps an onboarded token onboarded", () => {
    const t = tok({ onboarded: true, role: "STUDENT" });
    expect(tokenWhenEntitlementsUnknown(t, undefined)?.onboarded).toBe(true);
  });
  it("a fresh sign-in of a finished account uses the user row, not the wizard default", () => {
    const t = tokenWhenEntitlementsUnknown(tok(), { role: "STUDENT", hasCurriculumAccess: false, name: "A B", onboarded: true });
    expect(t?.onboarded).toBe(true);
    expect(t?.name).toBe("A B");
  });
  it("a fresh sign-in of an unfinished account still goes to the wizard", () => {
    expect(tokenWhenEntitlementsUnknown(tok(), { onboarded: false })?.onboarded).toBe(false);
  });
  it("with nothing to go on, the caller falls back to the defaults", () => {
    expect(tokenWhenEntitlementsUnknown(tok(), undefined)).toBeNull();
  });
});
