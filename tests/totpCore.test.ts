import { describe, expect, it } from "vitest";
import { generateSync } from "otplib";
import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret, generateBackupCodes, hashBackupCode, normalizeBackupCode, newTotpSecret, parseTotpKey, totpStep } from "@/lib/totpCore";

const key = randomBytes(32);

describe("admin two-step, pure parts", () => {
  it("encrypts a secret and reads it back, and a changed byte or a different key fails", () => {
    const secret = newTotpSecret();
    const stored = encryptSecret(secret, key);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored, key)).toBe(secret);
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
    const raw = Buffer.from(stored, "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptSecret(raw.toString("base64"), key)).toThrow();
  });
  it("refuses a missing or wrong-size key instead of weakening", () => {
    expect(() => parseTotpKey(undefined)).toThrow();
    expect(() => parseTotpKey(Buffer.from("short").toString("base64"))).toThrow();
    expect(parseTotpKey(key.toString("base64"))).toHaveLength(32);
  });
  it("accepts the current code and rejects a wrong or malformed one", () => {
    const secret = newTotpSecret();
    expect(totpStep(secret, generateSync({ secret }))).toBe(Math.floor(Date.now() / 30_000));
    expect(totpStep(secret, "000000")).toBeNull();
    expect(totpStep(secret, "12345")).toBeNull();
    expect(totpStep(secret, "abcdef")).toBeNull();
  });
  it("makes eight distinct backup codes that hash the same however they are typed", () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(8);
    const c = codes[0];
    expect(hashBackupCode(c)).toBe(hashBackupCode(c.toUpperCase().replace("-", " ")));
    expect(normalizeBackupCode(c)).toHaveLength(10);
    expect(hashBackupCode(codes[0])).not.toBe(hashBackupCode(codes[1]));
  });
});
