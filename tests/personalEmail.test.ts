import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

beforeEach(() => {
  send.mockReset();
  process.env.RESEND_API_KEY = "test-key";
});

describe("sendPersonalEmail", () => {
  it("sends from the reply-able address, with a greeting and no template", async () => {
    send.mockResolvedValue({ data: { id: "1" }, error: null });
    const { sendPersonalEmail } = await import("@/lib/email");
    await sendPersonalEmail("a@b.com", "Schedule", "Classes move to 6 PM.", { firstName: "Sam" });
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.from).toContain("music@bassnotepiano.com");
    expect(arg.subject).toBe("Schedule");
    expect(arg.text).toContain("Hi Sam,");
    expect(arg.html).not.toContain("gradient");
  });

  it("falls back to the standard sender when the custom one is not verified yet", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: "domain not verified" } }).mockResolvedValueOnce({ data: { id: "2" }, error: null });
    const { sendPersonalEmail } = await import("@/lib/email");
    await sendPersonalEmail("a@b.com", "Hello", "Body");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].from).toContain("music@bassnotepiano.com");
    expect(send.mock.calls[1][0].from).toContain("noreply");
  });

  it("tries the root-domain sender last, so mail still goes out when only that domain is verified", async () => {
    send
      .mockResolvedValueOnce({ data: null, error: { message: "domain not verified" } })
      .mockResolvedValueOnce({ data: null, error: { message: "domain not verified" } })
      .mockResolvedValueOnce({ data: { id: "3" }, error: null });
    const { sendPersonalEmail } = await import("@/lib/email");
    await sendPersonalEmail("a@b.com", "Hello", "Body");
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0].from).toBe("Bass Note Piano <noreply@bassnotepiano.com>");
  });
});
