// Fills the STAGING database with test accounts the smoke checks sign in as. Safe to run again (it updates what exists).
//   I_AM_SEEDING_STAGING=yes STAGING_SEED_PASSWORD='a long password' DATABASE_URL=<the staging database> node scripts/seed-staging.mjs
// Refuses to run without I_AM_SEEDING_STAGING=yes, so it can never be pointed at the live database by accident.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.I_AM_SEEDING_STAGING !== "yes") {
  console.error("Refusing to run: set I_AM_SEEDING_STAGING=yes, and point DATABASE_URL at the STAGING database.");
  process.exit(1);
}
const password = process.env.STAGING_SEED_PASSWORD ?? "";
if (password.length < 12) {
  console.error("Set STAGING_SEED_PASSWORD to at least 12 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 10);
const base = { passwordHash, emailVerified: new Date(), onboardedAt: new Date(), onboardingTourSeenAt: new Date(), lastSeenPatchVersion: "2.0.0" };

async function user(email, name, username, extra = {}) {
  return prisma.user.upsert({ where: { email }, update: { ...base, name, username, ...extra }, create: { ...base, email, name, username, ...extra } });
}

const admin = await user("admin@bnp-test.local", "Ada Admin", "ada_admin", { role: "ADMIN" });
const student = await user("student@bnp-test.local", "Sam Student", "sam_student", { classCredits: 40 });
const parent = await user("parent@bnp-test.local", "Pat Parent", "pat_parent");
const child = await user("child@bnp-test.local", "Kiki Child", "kiki_child", { classCredits: 8 });
const child2 = await user("child2@bnp-test.local", "Remy Child", "remy_child");

async function schedule(label, dayOfWeek, startTime, durationMin) {
  const found = await prisma.classSchedule.findFirst({ where: { label } });
  if (found) return found;
  return prisma.classSchedule.create({ data: { label, dayOfWeek, startTime, durationMin, creditCost: Math.round(durationMin / 30), active: true } });
}
const tue = await schedule("Staging Tuesday", 2, "16:00", 180);
await schedule("Staging Thursday", 4, "17:00", 120);
await schedule("Staging Saturday", 6, "14:00", 120);

// Parent mode: one linked child with a parent-paid plan and two classes, and one request still waiting.
await prisma.parentLink.upsert({ where: { parentId_childId: { parentId: parent.id, childId: child.id } }, update: { status: "ACCEPTED", respondedAt: new Date() }, create: { parentId: parent.id, childId: child.id, status: "ACCEPTED", respondedAt: new Date() } });
await prisma.parentLink.upsert({ where: { parentId_childId: { parentId: parent.id, childId: child2.id } }, update: { status: "PENDING", respondedAt: null }, create: { parentId: parent.id, childId: child2.id, status: "PENDING" } });
if (!(await prisma.paymentPlan.findFirst({ where: { userId: child.id, status: "ACTIVE" } }))) {
  const group = await prisma.familyPlanGroup.create({ data: { payerId: parent.id, kind: "PARENT" } });
  const plan = await prisma.paymentPlan.create({
    data: { userId: child.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 19999, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * 864e5), reservedScheduleId: tue.id, reservedChunkIndex: 0, familyGroupId: group.id },
  });
  for (const days of [5, 12]) {
    const at = new Date(Date.now() + days * 864e5);
    await prisma.classBooking.create({ data: { studentId: child.id, scheduleId: tue.id, occurrenceDate: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())), scheduledAt: at, creditsSpent: 2, reservedByPlanId: plan.id } }).catch(() => undefined);
  }
}

console.log(`Staging seeded: admin ${admin.email}, student ${student.email}, parent ${parent.email}, child ${child.email} (all with the seed password).`);
await prisma.$disconnect();
