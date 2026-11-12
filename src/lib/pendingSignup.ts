import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

// Registering again over an account that was never confirmed must NOT change that account's password on the spot: anyone can type
// someone else's address, and the real owner would then confirm an account whose password a stranger chose. So the new name and
// password hash wait inside the emailed code (its payload) and are applied only when the code is entered by the browser that asked for
// them. That browser is handed a random "claim" when it registers and keeps it, and the code's payload holds only the claim's hash.
//
// THE RULE: a password survives the confirmation of an email only if the browser that set it proves it (the claim matches). Every
// other confirmation proves the INBOX but not the password, so the password on file is forgotten (replaced by one nobody knows,
// `unusablePasswordHash`) and the person signs in with "Email me a code instead" or Forgot password. This covers the attack where
// a stranger registered the victim's address FIRST: the row holds the stranger's password, and when the victim confirms (with
// their own claim, or none, or a code the stranger triggered by logging in) that password dies instead of becoming the victim's.
// Every place that issues a verification code (register, log in, resend, change email) carries a payload for the same reason, and a code
// WITHOUT a readable payload gets no exception: it forgets the password too (a stranger could otherwise make a payload unreadable
// on purpose, or leave an old code behind, and keep the password through the owner's confirmation).

export interface PendingSignup {
  name: string;
  passwordHash: string;
  /** sha256 of the claim handed to the browser that registered. */
  claimHash: string;
}

const KEY = "pendingSignup";
const MAX_STORED_NAME = 200;

export function hashClaim(claim: string): string {
  return createHash("sha256").update(claim).digest("hex");
}

/** A fresh random claim, and the hash that goes into the code's payload. The claim itself is never stored. */
export function newSignupClaim(): { claim: string; claimHash: string } {
  const claim = randomBytes(24).toString("hex");
  return { claim, claimHash: hashClaim(claim) };
}

export function pendingSignupPayload(pending: PendingSignup): Prisma.InputJsonValue {
  // Clamped here, the one place payloads are made, so what is written always reads back: a payload that could not be read would
  // look like "no payload", and a code with no payload must never be a way to keep a password (see verifyEmailAction).
  return { [KEY]: { name: pending.name.slice(0, MAX_STORED_NAME), passwordHash: pending.passwordHash, claimHash: pending.claimHash } };
}

/** The pending name and password in a code's payload, or null when it holds none (or anything malformed). */
export function readPendingSignup(payload: unknown): PendingSignup | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = (payload as Record<string, unknown>)[KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { name, passwordHash, claimHash } = raw as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.length > MAX_STORED_NAME) return null;
  // A bcrypt hash, as the register route makes it: never accept anything else into a password column.
  if (typeof passwordHash !== "string" || !/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(passwordHash)) return null;
  if (typeof claimHash !== "string" || !/^[0-9a-f]{64}$/.test(claimHash)) return null;
  return { name, passwordHash, claimHash };
}

/** A valid bcrypt hash of a random secret nobody ever sees: the account then has NO password that works, until the person sets one. */
export async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), 10);
}

/** True only for the claim this payload was made for. Compared in constant time. */
export function claimMatches(pending: PendingSignup, claim: unknown): boolean {
  if (typeof claim !== "string" || claim.length === 0 || claim.length > 200) return false;
  const given = Buffer.from(hashClaim(claim), "hex");
  const wanted = Buffer.from(pending.claimHash, "hex");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
