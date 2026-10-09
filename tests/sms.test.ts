import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkVerifySession, isSmsConfigured, smsAvailable, startVerifySession } from "@/lib/sms";

const OLD = { ...process.env };
beforeEach(() => {
  process.env.PLIVO_AUTH_ID = "MAXXXXXXXXXXXXXXXXXX";
  process.env.PLIVO_AUTH_TOKEN = "secret-token";
  delete process.env.PLIVO_VERIFY_APP_UUID;
});
afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

describe("Plivo Verify requests", () => {
  it("asks Plivo to text a code, authenticated, and returns the session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ session_uuid: "sess-123", message: "Session initiated" }), { status: 202 }));
    expect(await startVerifySession("+15552345678")).toBe("sess-123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.plivo.com/v1/Account/MAXXXXXXXXXXXXXXXXXX/Verify/Session/");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("MAXXXXXXXXXXXXXXXXXX:secret-token").toString("base64")}`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ recipient: "+15552345678", channel: "sms" });
    expect(body.app_uuid).toBeUndefined();
  });

  it("names a specific Verify application when one is configured", async () => {
    process.env.PLIVO_VERIFY_APP_UUID = "app-uuid-1";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ session_uuid: "s" }), { status: 202 }));
    await startVerifySession("+15552345678");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).app_uuid).toBe("app-uuid-1");
  });

  it("throws, without leaking the number, when Plivo refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
    await expect(startVerifySession("+15552345678")).rejects.toThrow(/\(400\)/);
    await expect(startVerifySession("+15552345678")).rejects.not.toThrow(/5552345678/);
  });

  it("checks a code against its session and tells right, wrong and unreachable apart", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await checkVerifySession("sess-123", "123456")).toBe("valid");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.plivo.com/v1/Account/MAXXXXXXXXXXXXXXXXXX/Verify/Session/sess-123/");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ otp: "123456" });

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    expect(await checkVerifySession("sess-123", "000000")).toBe("invalid");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    expect(await checkVerifySession("sess-123", "000000")).toBe("error");
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await checkVerifySession("sess-123", "000000")).toBe("error");
  });
});

describe("availability", () => {
  it("is configured only with both Plivo credentials", () => {
    expect(isSmsConfigured()).toBe(true);
    delete process.env.PLIVO_AUTH_TOKEN;
    expect(isSmsConfigured()).toBe(false);
  });
  it("is off in production without a provider, so nobody gets locked out", () => {
    delete process.env.PLIVO_AUTH_ID;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(smsAvailable()).toBe(false);
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(smsAvailable()).toBe(true);
  });
});
