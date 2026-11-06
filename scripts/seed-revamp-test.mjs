// Local-only test student for the UI revamp's screenshots (docs/revamp). Refuses to run against anything but a local database.
// Sign in at http://localhost:<port>/login with these values; the emailed code is printed in the dev server log.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL || "";
// Parse the address and look at the real host: a pattern match on the text can be fooled by "@localhost" appearing in a query string.
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  host = "";
}
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error("Refusing: DATABASE_URL is not a local database.");
  process.exit(1);
}
export const TEST_EMAIL = "revamp-student@bnp.test";
// A fresh random password every run, printed once below; there is no password stored in the repository.
import { randomBytes } from "node:crypto";
export const TEST_PASSWORD = `Rv-${randomBytes(9).toString("base64url")}!9`;
console.log(`Test password for this run: ${TEST_PASSWORD}`);

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
const user = await prisma.user.upsert({
  where: { email: TEST_EMAIL },
  update: { passwordHash, bannedAt: null },
  create: {
    email: TEST_EMAIL,
    emailVerified: new Date(),
    name: "Revamp Student",
    username: "revamp-student",
    passwordHash,
    onboardedAt: new Date(),
    onboardingTourSeenAt: new Date(),
    hasCurriculumAccess: true,
    classCredits: 8,
    lastSeenPatchNotesAt: new Date(),
  },
});
const ADMIN_EMAIL = "revamp-admin@bnp.test";
await prisma.user.upsert({
  where: { email: ADMIN_EMAIL },
  update: { passwordHash, role: "ADMIN", bannedAt: null },
  create: { email: ADMIN_EMAIL, emailVerified: new Date(), name: "Revamp Admin", username: "revamp-admin", passwordHash, role: "ADMIN", onboardedAt: new Date(), onboardingTourSeenAt: new Date(), hasCurriculumAccess: true, lastSeenPatchNotesAt: new Date() },
});
console.log("ready:", user.email, ADMIN_EMAIL);
await prisma.$disconnect();
