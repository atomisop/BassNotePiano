import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";

// Admin two-step sign-in, pure parts (no database): encrypting the secret at rest, recovery codes, and checking a code.
// Same AES-256-GCM layout as the nightly backup (src/lib/backupCore.ts), with its own marker so the two can never be mixed up.

const MAGIC = Buffer.from("BNPT1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const BACKUP_CODE_COUNT = 8;

/** ADMIN_TOTP_ENCRYPTION_KEY: 32 random bytes, base64. Anything else is refused, not silently weakened. */
export function parseTotpKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("ADMIN_TOTP_ENCRYPTION_KEY is not set.");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("ADMIN_TOTP_ENCRYPTION_KEY must be 32 random bytes encoded as base64.");
  return key;
}

/** magic, iv, auth tag, ciphertext, base64 so it fits a text column. A changed byte anywhere makes decryption fail. */
export function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(stored: string, key: Buffer): string {
  const file = Buffer.from(stored, "base64");
  if (file.length < MAGIC.length + IV_BYTES + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a stored secret.");
  const iv = file.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = file.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(file.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}

export function newTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, accountEmail: string): string {
  return generateURI({ issuer: "Bass Note Piano", label: accountEmail, secret });
}

/** The 30 second step a six digit code belongs to, or null when it is wrong. One step either side is allowed for clock drift. */
export function totpStep(secret: string, token: string): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const result = verifySync({ secret, token, epochTolerance: 30 });
  if (!result.valid) return null;
  // delta is how many steps the code was off from now (0, -1 or 1), so this is the step the code belongs to.
  return Math.floor(Date.now() / 30_000) + ("delta" in result && typeof result.delta === "number" ? result.delta : 0);
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alike letters or digits

/** Eight codes like "k3f9a-m2x7q" (50 bits each): shown once, only their hashes are stored. */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeBackupCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashBackupCode(input: string): string {
  return createHash("sha256").update(`admin-backup:${normalizeBackupCode(input)}`).digest("hex");
}

/** A typed second step is a six digit authenticator code, or else a backup code. */
export function isAuthenticatorCode(input: string): boolean {
  return /^\d{6}$/.test(input.trim().replace(/\s/g, ""));
}
