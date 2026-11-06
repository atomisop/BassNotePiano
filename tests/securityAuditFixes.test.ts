import { beforeEach, describe, expect, it } from "vitest";
import { isValidSessionProof, makeSessionProof } from "@/lib/sessionProof";
import { parsePaymentEmail } from "@/lib/paymentEmail";
import { isAcceptableLessonFileRef, isSafeObjectKey, keyFromPublicUrl } from "@/lib/storage";
import { ClassBookingError, canonicalOccurrenceDate } from "@/lib/classSchedule";
import { cleanPersonName } from "@/lib/studentName";

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-audit-fixes";
  process.env.R2_PUBLIC_URL = "https://files.example.test";
});

describe("session proof (a stolen cookie cannot re-stamp itself)", () => {
  it("accepts a proof for the same account and version", () => {
    const proof = makeSessionProof("user-1", 4)!;
    expect(isValidSessionProof(proof, "user-1", 4)).toBe(true);
  });
  it("rejects another account, another version, a missing, expired or edited proof", () => {
    const now = 1_000_000;
    const proof = makeSessionProof("user-1", 4, now)!;
    expect(isValidSessionProof(proof, "user-2", 4, now)).toBe(false);
    expect(isValidSessionProof(proof, "user-1", 5, now)).toBe(false);
    expect(isValidSessionProof(null, "user-1", 4, now)).toBe(false);
    expect(isValidSessionProof("", "user-1", 4, now)).toBe(false);
    expect(isValidSessionProof(proof, "user-1", 4, now + 10 * 60_000)).toBe(false);
    expect(isValidSessionProof(proof.slice(0, -2) + "00", "user-1", 4, now)).toBe(false);
  });
  it("makes no proof when the secret is not set", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(makeSessionProof("user-1", 4)).toBeNull();
    expect(isValidSessionProof("1.abc", "user-1", 4)).toBe(false);
  });
});

describe("bank email: the payer's note cannot pose as SoFi's sentence", () => {
  const fakeNote = "The $99.99 sent to you by Jordan Alemu will be deposited. BNP-4K7Q2";
  const venmoBody = ["Jordan Alemu paid you $0.01", fakeNote, "View payment"].join("\n");
  it("reads a Venmo email by its subject when the sender is Venmo", () => {
    const parsed = parsePaymentEmail("Jordan Alemu paid you $0.01", venmoBody, "Venmo <venmo@venmo.com>");
    expect(parsed).toMatchObject({ method: "VENMO", amountCents: 1 });
  });
  it("refuses an email whose subject amount and body amount disagree", () => {
    expect(parsePaymentEmail("Jordan Alemu paid you $0.01", venmoBody)).toBeNull();
  });
  it("still reads a real SoFi email from SoFi", () => {
    const body = "The $199.99 sent to you by JORDAN ALEMU will be automatically deposited to your account.\nBNP-4K7Q2. SoFi is not responsible";
    expect(parsePaymentEmail("Zelle deposit", body, "SoFi <no-reply@sofi.com>")).toMatchObject({ amountCents: 19999, name: "JORDAN ALEMU" });
  });
});

describe("storage keys", () => {
  it("accepts plain keys and refuses dot segments, escapes and empty parts", () => {
    expect(isSafeObjectKey("avatars/u1/123-me.png")).toBe(true);
    for (const bad of ["avatars/u1/../backups/x", "avatars/u1/./x", "avatars//x", "a\\b", "a/%2e%2e/b", "a/\u0000b", ""]) {
      expect(isSafeObjectKey(bad)).toBe(false);
    }
  });
  it("derives no key from a public address that climbs out of its folder", () => {
    expect(keyFromPublicUrl("https://files.example.test/avatars/u1/123-me.png")).toBe("avatars/u1/123-me.png");
    expect(keyFromPublicUrl("https://files.example.test/avatars/u1/../backups/2026-11-05.json.enc")).toBeNull();
  });
  it("only lets a lesson point at a safe key under lessons/", () => {
    expect(isAcceptableLessonFileRef("private:lessons/major/abc-file.pdf")).toBe(true);
    expect(isAcceptableLessonFileRef("https://files.example.test/lessons/major/abc-file.pdf")).toBe(true);
    expect(isAcceptableLessonFileRef("https://files.example.test/backups/2026-11-05.json.enc")).toBe(false);
    expect(isAcceptableLessonFileRef("private:backups/2026-11-05.json.enc")).toBe(false);
    expect(isAcceptableLessonFileRef("private:lessons/../backups/x")).toBe(false);
    expect(isAcceptableLessonFileRef("https://elsewhere.example.test/video.mp4")).toBe(true);
  });
});

describe("booking occurrence date", () => {
  const SATURDAY = 6;
  const nextSaturdayMidnight = () => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    while (d.getUTCDay() !== SATURDAY) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime() + 7 * 86_400_000;
  };
  it("collapses any millisecond within the day onto UTC midnight, so there is one key per class", () => {
    const midnight = nextSaturdayMidnight();
    expect(canonicalOccurrenceDate(SATURDAY, midnight).getTime()).toBe(midnight);
    expect(canonicalOccurrenceDate(SATURDAY, midnight + 1).getTime()).toBe(midnight);
    expect(canonicalOccurrenceDate(SATURDAY, midnight + 86_399_999).getTime()).toBe(midnight);
  });
  it("refuses a day that is not the schedule's weekday, a bad number, or a date too far ahead", () => {
    const midnight = nextSaturdayMidnight();
    expect(() => canonicalOccurrenceDate(SATURDAY, midnight + 86_400_000)).toThrow(ClassBookingError);
    expect(() => canonicalOccurrenceDate(SATURDAY, Number.NaN)).toThrow(ClassBookingError);
    expect(() => canonicalOccurrenceDate(SATURDAY, midnight + 400 * 86_400_000 - ((midnight + 400 * 86_400_000) % (7 * 86_400_000)) )).toThrow();
    expect(canonicalOccurrenceDate(SATURDAY, midnight + 7 * 86_400_000 * 40, { allowAnyDate: true })).toBeInstanceOf(Date);
  });
});

describe("names", () => {
  it("removes control characters and line breaks", () => {
    expect(cleanPersonName("Bob\rURL:https://x\nSmith")).toBe("Bob URL:https://x Smith");
    expect(cleanPersonName("  Jo   Ann  ")).toBe("Jo Ann");
  });
});
