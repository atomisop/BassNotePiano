// Makes (or reuses) a FAKE student in a throwaway local database and prints a signed session cookie for it.
// Refuses to run unless DATABASE_URL is a local host AND the database name contains "verify" or "test".
// Usage: node --env-file=.env scripts/rework/test-session.mjs [email] [--onboarded]
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// The "what's new" popup shows until a person has seen the newest entry, so a returning fake student must have seen it.
const latestVersion = readFileSync(new URL("../../src/lib/changelog.ts", import.meta.url), "utf8").match(/version:\s*"([^"]+)"/)?.[1];

const url = new URL(process.env.DATABASE_URL ?? "postgresql://none");
const db = url.pathname.slice(1);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/verify|test/i.test(db)) {
  console.error(`Refusing: DATABASE_URL must be local and name a verify/test database (got ${url.hostname}/${db}).`);
  process.exit(2);
}
const email = process.argv.find((a) => a.includes("@")) ?? "rework.student@example.test";
const onboarded = process.argv.includes("--onboarded");
const prisma = new PrismaClient();
const data = { name: "Rework Student", emailVerified: new Date(), role: "STUDENT", ...(onboarded ? { username: "rw_" + createHash("sha1").update(email).digest("hex").slice(0, 12), onboardedAt: new Date(), onboardingTourSeenAt: new Date(), lastSeenPatchVersion: latestVersion, primaryInstrument: "PIANO_KEYBOARD" } : { onboardedAt: null, username: null }) };
const user = await prisma.user.upsert({ where: { email }, update: data, create: { email, ...data } });
const token = await encode({ token: { sub: user.id, email, name: user.name, role: "STUDENT", onboarded, hasCurriculumAccess: false, unlockedScaleSlugs: [], completedScaleSlugs: [] }, secret: process.env.NEXTAUTH_SECRET });
await prisma.$disconnect();
console.log(token);
