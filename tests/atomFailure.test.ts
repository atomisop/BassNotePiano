import { describe, expect, it } from "vitest";
import {
  ATOM_ALERT_REPEAT_HOURS,
  ATOM_BUSY_FAILURES,
  ATOM_RECOVERED,
  ATOM_UNAVAILABLE_MESSAGE,
  GeminiError,
  atomAlertNote,
  classifyGeminiFailure,
  describeAtomAlert,
  shouldAlertAtom,
  shouldAnnounceAtomRecovery,
} from "@/lib/atomFailure";

const NOW = new Date("2026-10-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("classifyGeminiFailure", () => {
  it("credits: 402, and a quota or billing message on a 401, 403 or 429", () => {
    expect(classifyGeminiFailure(402, "")).toBe("credits");
    expect(classifyGeminiFailure(429, "Resource has been exhausted (e.g. check quota). RESOURCE_EXHAUSTED")).toBe("credits");
    expect(classifyGeminiFailure(403, "Your prepayment credits are depleted")).toBe("credits");
    expect(classifyGeminiFailure(401, "billing account is not active")).toBe("credits");
  });
  it("key: an empty or plain 401 or 403, and a rejected key on a 400", () => {
    expect(classifyGeminiFailure(401, "")).toBe("key");
    expect(classifyGeminiFailure(403, "PERMISSION_DENIED")).toBe("key");
    expect(classifyGeminiFailure(400, "API key not valid. Please pass a valid API key.")).toBe("key");
  });
  it("busy: a plain rate limit, any 5xx, a timeout, and a network error", () => {
    expect(classifyGeminiFailure(429, "Too many requests, slow down")).toBe("busy");
    expect(classifyGeminiFailure(503, "The model is overloaded")).toBe("busy");
    expect(classifyGeminiFailure(500, "")).toBe("busy");
    expect(classifyGeminiFailure(408, "")).toBe("busy");
    expect(classifyGeminiFailure(0, "The operation was aborted due to timeout")).toBe("busy");
  });
  it("other: anything else", () => {
    expect(classifyGeminiFailure(404, "model not found")).toBe("other");
    expect(classifyGeminiFailure(400, "bad request body")).toBe("other");
  });
  it("GeminiError carries its status and works out its own kind", () => {
    const err = new GeminiError(402, "no credit");
    expect(err.kind).toBe("credits");
    expect(err.status).toBe(402);
    expect(err.message).toContain("402");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("shouldAlertAtom", () => {
  const base = { recentFailures: 1, now: NOW };
  it("credits and key problems alert on the very first failure", () => {
    expect(shouldAlertAtom({ ...base, kind: "credits", last: null })).toBe(true);
    expect(shouldAlertAtom({ ...base, kind: "key", last: null })).toBe(true);
  });
  it("a one-off temporary failure does not alert, a run of them does", () => {
    expect(shouldAlertAtom({ ...base, kind: "busy", last: null })).toBe(false);
    expect(shouldAlertAtom({ ...base, kind: "other", recentFailures: ATOM_BUSY_FAILURES - 1, last: null })).toBe(false);
    expect(shouldAlertAtom({ ...base, kind: "busy", recentFailures: ATOM_BUSY_FAILURES, last: null })).toBe(true);
  });
  it("does not repeat inside the repeat window, repeats after it", () => {
    const last = { note: "credits", ranAt: hoursAgo(ATOM_ALERT_REPEAT_HOURS - 1) };
    expect(shouldAlertAtom({ ...base, kind: "credits", last })).toBe(false);
    expect(shouldAlertAtom({ ...base, kind: "credits", last: { ...last, ranAt: hoursAgo(ATOM_ALERT_REPEAT_HOURS + 1) } })).toBe(true);
  });
  it("alerts again at once if the problem changes kind or returns after a recovery", () => {
    expect(shouldAlertAtom({ ...base, kind: "key", last: { note: "credits", ranAt: hoursAgo(1) } })).toBe(true);
    expect(shouldAlertAtom({ ...base, kind: "credits", last: { note: ATOM_RECOVERED, ranAt: hoursAgo(1) } })).toBe(true);
  });
  it("announces recovery only while an alert is open", () => {
    expect(shouldAnnounceAtomRecovery(null)).toBe(false);
    expect(shouldAnnounceAtomRecovery({ note: ATOM_RECOVERED })).toBe(false);
    expect(shouldAnnounceAtomRecovery({ note: "credits" })).toBe(true);
  });
  it("groups temporary and unknown failures as busy", () => {
    expect(atomAlertNote("credits")).toBe("credits");
    expect(atomAlertNote("key")).toBe("key");
    expect(atomAlertNote("busy")).toBe("busy");
    expect(atomAlertNote("other")).toBe("busy");
  });
});

describe("messages", () => {
  it("the owner is told what to do, per kind", () => {
    expect(describeAtomAlert("credits")).toMatchObject({ external: true });
    expect(describeAtomAlert("credits").body).toContain("auto-reload");
    expect(describeAtomAlert("key").body).toContain("GOOGLE_AI_API_KEY");
    expect(describeAtomAlert("busy")).toMatchObject({ external: false });
  });
  it("what a visitor sees never mentions keys, credits, billing or Google", () => {
    expect(ATOM_UNAVAILABLE_MESSAGE).not.toMatch(/key|credit|billing|google|gemini|quota/i);
  });
});
