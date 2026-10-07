import { beforeEach, describe, expect, it, vi } from "vitest";

const askAssistant = vi.fn();
const recordAtomFailure = vi.fn();
const noteAtomSuccess = vi.fn();
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("@/lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/atomHealth", () => ({
  recordAtomFailure: (...a: unknown[]) => recordAtomFailure(...a),
  noteAtomSuccess: (...a: unknown[]) => noteAtomSuccess(...a),
}));
vi.mock("@/lib/assistant", () => {
  class RateLimitError extends Error {}
  return {
    RateLimitError,
    askAssistant: (...a: unknown[]) => askAssistant(...a),
    assertAssistantRateLimit: async () => undefined,
    appendPersistedMessages: async () => undefined,
  };
});

import { POST } from "@/app/api/assistant/route";
import { ATOM_UNAVAILABLE_MESSAGE, GeminiError } from "@/lib/atomFailure";

function chat() {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Do you teach piano?" }] }),
  });
}

describe("POST /api/assistant when Gemini fails", () => {
  beforeEach(() => {
    askAssistant.mockReset();
    recordAtomFailure.mockReset();
    noteAtomSuccess.mockReset();
  });

  it("answers 503 with a friendly message and a code the widget acts on, and tells the owner", async () => {
    const err = new GeminiError(402, "Your credits are used up");
    askAssistant.mockRejectedValue(err);
    const res = await POST(chat());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: ATOM_UNAVAILABLE_MESSAGE, code: "atom_unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/credit|402|gemini/i); // nothing about the cause reaches a visitor
    expect(recordAtomFailure).toHaveBeenCalledWith(err);
    expect(noteAtomSuccess).not.toHaveBeenCalled();
  });

  it("treats a network failure the same way", async () => {
    askAssistant.mockRejectedValue(new GeminiError(0, "timeout"));
    const res = await POST(chat());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("atom_unavailable");
  });

  it("keeps the generic 500 for errors that are not Gemini's, and does not raise an Atom alert", async () => {
    askAssistant.mockRejectedValue(new Error("database exploded"));
    const res = await POST(chat());
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBeUndefined();
    expect(recordAtomFailure).not.toHaveBeenCalled();
  });

  it("a good answer returns the reply and lets the recovery notice fire", async () => {
    askAssistant.mockResolvedValue("Yes, we teach piano.");
    const res = await POST(chat());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "Yes, we teach piano." });
    expect(noteAtomSuccess).toHaveBeenCalledTimes(1);
    expect(recordAtomFailure).not.toHaveBeenCalled();
  });
});
