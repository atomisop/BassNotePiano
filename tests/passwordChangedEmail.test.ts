import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
// Imported once, at the top: inside each test the import took longer than the 5s test timeout when the whole suite ran at once.
const email = await import("@/lib/email");

beforeEach(() => {
  send.mockReset();
  process.env.RESEND_API_KEY = "test-key";
});

describe("sendPasswordChangedEmail", () => {
  it("sends the security notice from the noreply sender with a reset link", async () => {
    send.mockResolvedValue({ data: { id: "1" }, error: null });
    const { sendPasswordChangedEmail } = email;
    await sendPasswordChangedEmail("a@b.com", "Sam Lee");
    const arg = send.mock.calls[0][0];
    expect(arg.from).toContain("noreply");
    expect(arg.subject).toBe("Your password was changed");
    expect(arg.text).toContain("Hi Sam,");
    expect(arg.text).toContain("/forgot-password");
  });
});
