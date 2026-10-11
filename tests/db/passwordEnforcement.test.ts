import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { resetPasswordAction } from "@/app/(auth)/reset-password/actions";

describe("the server enforces the password rules, not only the screen", () => {
  it("refuses a new password without a special character or with too few characters, before looking at the code", async () => {
    const noSymbol = await resetPasswordAction("nobody@example.com", "000000", "abcdefgh12");
    expect(noSymbol).toMatchObject({ ok: false });
    expect((noSymbol as { error: string }).error).toMatch(/special character/);
    const short = await resetPasswordAction("nobody@example.com", "000000", "a!b2");
    expect((short as { error: string }).error).toMatch(/at least 8 characters/);
  });
});
