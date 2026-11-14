import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { claimMatches, hashClaim, newSignupClaim, pendingSignupPayload, readPendingSignup, unusablePasswordHash } from "@/lib/pendingSignup";

const hash = bcrypt.hashSync("Passw0rd!x", 4);

describe("the password that waits inside an emailed code", () => {
  it("round-trips through the payload", () => {
    const { claimHash } = newSignupClaim();
    const pending = { name: "Sam Jones", passwordHash: hash, claimHash };
    expect(readPendingSignup(pendingSignupPayload(pending))).toEqual(pending);
  });

  it("is only accepted for the claim it was made for", () => {
    const { claim, claimHash } = newSignupClaim();
    const pending = { name: "Sam Jones", passwordHash: hash, claimHash };
    expect(claimMatches(pending, claim)).toBe(true);
    expect(claimMatches(pending, newSignupClaim().claim)).toBe(false);
    for (const bad of [undefined, null, "", 5, {}, "x".repeat(300), claimHash]) expect(claimMatches(pending, bad)).toBe(false);
  });

  it("stores only a hash of the claim, never the claim", () => {
    const { claim, claimHash } = newSignupClaim();
    expect(claimHash).toBe(hashClaim(claim));
    expect(claimHash).not.toBe(claim);
    expect(JSON.stringify(pendingSignupPayload({ name: "A B", passwordHash: hash, claimHash }))).not.toContain(claim);
  });

  it("makes a different claim every time", () => {
    expect(newSignupClaim().claim).not.toBe(newSignupClaim().claim);
  });

  it("ignores anything that is not exactly what the register route writes", () => {
    const { claimHash } = newSignupClaim();
    const good = { name: "Sam Jones", passwordHash: hash, claimHash };
    for (const payload of [
      null,
      undefined,
      "x",
      [],
      {},
      { pendingSignup: null },
      { pendingSignup: { ...good, name: "" } },
      { pendingSignup: { ...good, name: "x".repeat(201) } },
      { pendingSignup: { ...good, passwordHash: "plaintext-password" } },
      { pendingSignup: { ...good, passwordHash: "$2b$04$short" } },
      { pendingSignup: { ...good, claimHash: "not-hex" } },
      { pendingSignup: { ...good, claimHash: claimHash.toUpperCase() } },
    ]) {
      expect(readPendingSignup(payload)).toBeNull();
    }
  });
});

describe("the password nobody knows", () => {
  it("is a valid bcrypt hash that differs every time and matches nothing a person could type", async () => {
    const a = await unusablePasswordHash();
    const b = await unusablePasswordHash();
    expect(a).toMatch(/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/);
    expect(a).not.toBe(b);
    for (const guess of ["", "password", "Passw0rd!x", a]) expect(await bcrypt.compare(guess, a)).toBe(false);
  });
});

describe("a payload always reads back", () => {
  it("even with an absurd name (cut to what is kept), so it can never look like 'no payload'", () => {
    const { claimHash } = newSignupClaim();
    for (const name of ["Sam Jones", "x".repeat(200), "x".repeat(201), "y".repeat(5000)]) {
      const read = readPendingSignup(pendingSignupPayload({ name, passwordHash: hash, claimHash }));
      expect(read).not.toBeNull();
      expect(read!.name.length).toBeLessThanOrEqual(200);
      expect(read!.passwordHash).toBe(hash);
    }
  });
});
