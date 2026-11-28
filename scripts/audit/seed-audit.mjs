// Fills a LOCAL database with a realistic studio for the full UI audit (docs/UI-AUDIT-RULE.md): an owner, students in every state,
// plans, bills, payments, classes this week, contacts, support threads and practice. Refuses anything but a local database.
// Run with OWNER_EMAIL=owner@bnp.test set for the dev server too. Usage: node scripts/audit/seed-audit.mjs
// Prints a fresh random password once; every seeded account uses it.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
// The newest "What's new" version, so the popup does not cover every screenshot.
const LATEST = readFileSync(new URL("../../src/lib/changelog.ts", import.meta.url), "utf8").match(/version: "([^"]+)"/)[1];

let host = "";
try { host = new URL(process.env.DATABASE_URL || "").hostname; } catch { host = ""; }
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) { console.error("Refusing: DATABASE_URL is not a local database."); process.exit(1); }

const PASSWORD = `Au-${randomBytes(9).toString("base64url")}!9`;
const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(PASSWORD, 10);
const DAY = 86400000;
const now = Date.now();
const at = (days, hour = 12) => { const d = new Date(now + days * DAY); d.setUTCHours(hour, 0, 0, 0); return d; };
const etDay = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const base = { passwordHash, emailVerified: new Date(now - 60 * DAY), onboardedAt: new Date(now - 60 * DAY), onboardingTourSeenAt: new Date(), lastSeenPatchNotesAt: new Date(), lastSeenPatchVersion: LATEST };

async function user(email, name, username, extra = {}) {
  return prisma.user.upsert({ where: { email }, update: { ...base, name, username, ...extra }, create: { ...base, email, name, username, ...extra } });
}

const owner = await user("owner@bnp.test", "Isaac Owner", "isaac_owner", { role: "ADMIN", hasCurriculumAccess: true });
await user("staff@bnp.test", "Dana Staff", "dana_staff", { role: "ADMIN" });

// Weekly windows (ET wall clock).
async function schedule(label, dayOfWeek, startTime, durationMin, seats = 1) {
  const found = await prisma.classSchedule.findFirst({ where: { label } });
  if (found) return found;
  return prisma.classSchedule.create({ data: { label, dayOfWeek, startTime, durationMin, creditCost: Math.round(durationMin / 30), active: true, seats } });
}
const windows = [
  await schedule("Monday evening", 1, "17:00", 180),
  await schedule("Tuesday evening", 2, "16:00", 180),
  await schedule("Wednesday evening", 3, "17:00", 120, 2),
  await schedule("Thursday evening", 4, "17:00", 180),
  await schedule("Saturday morning", 6, "10:00", 240),
];
const scales = await prisma.scaleGroup.findMany({ orderBy: { order: "asc" } });

const people = [
  ["Maya Tesfaye", "maya", { plan: "TERM_6", paid: 3, credits: 6, scale: 3, practice: 6, discord: true }],
  ["Liam Carter", "liam", { plan: "MONTHLY", paid: 2, credits: 2, scale: 1, practice: 1, overdueDays: 4 }],
  ["Selam Bekele", "selam", { plan: "TERM_3", paid: 1, credits: 8, scale: 2, practice: 4, pending: true, discord: true }],
  ["Noah Kim", "noah", { plan: "TERM_6", paid: 5, credits: 4, scale: 5, practice: 7, discord: true }],
  ["Hana Girma", "hana", { trialDays: 2, practice: 2 }],
  ["Ethan Brooks", "ethan", { plan: "MONTHLY", paid: 1, credits: 0, scale: 0, practice: 0, paused: true }],
  ["Ruth Alemu", "ruth", { plan: "TERM_3", paid: 3, credits: 2, scale: 2, practice: 3, scholarship: 50, discord: true }],
  ["Olivia Chen", "olivia", { plan: "TERM_6", paid: 2, credits: 6, scale: 1, practice: 5, firstClass: true }],
  ["Daniel Haile", "daniel", { plan: "MONTHLY", paid: 0, awaiting: true }],
  ["Sofia Rossi", "sofia", { comped: true, scale: 4, practice: 6, discord: true }],
  ["Yonas Mekonnen", "yonas", { plan: "TERM_6", paid: 4, credits: 1, scale: 3, practice: 0, rejected: true }],
  ["Ava Johnson", "ava", { canceled: true, practice: 0 }],
  ["Kidus Tadesse", "kidus", { plan: "TERM_6", paid: 6, credits: 8, scale: 6, practice: 7, scholarship: 100, discord: true }],
  ["Grace Lee", "grace", { trialDays: -1, practice: 0 }],
];

const created = [];
let slotIdx = 0;
for (const [name, handle, o] of people) {
  const email = `${handle}@bnp.test`;
  const u = await user(email, name, handle, {
    classCredits: (o.credits ?? 0) * 2,
    hasCurriculumAccess: !!o.comped,
    trialEndsAt: o.trialDays != null ? new Date(now + o.trialDays * DAY) : null,
    phone: `+1617555${String(1000 + created.length).slice(-4)}`,
    discordId: o.discord ? `9000000000${created.length}` : null,
    discordUsername: o.discord ? handle : null,
    currentStreak: o.practice ?? 0,
    longestStreak: (o.practice ?? 0) + 3,
    createdAt: new Date(now - (90 - created.length * 5) * DAY),
  });
  created.push([u, o]);

  // Learning progress.
  if (o.scale != null) {
    for (let i = 0; i <= Math.min(o.scale, scales.length - 1); i++) {
      const done = i < o.scale;
      await prisma.scaleProgress.upsert({
        where: { userId_scaleGroupId: { userId: u.id, scaleGroupId: scales[i].id } },
        update: {},
        create: { userId: u.id, scaleGroupId: scales[i].id, status: done ? "COMPLETED" : "IN_PROGRESS", moduleRead: true, moduleReadAt: at(-40 + i * 6), practiceCompleted: done, quizPassed: done, quizScore: done ? 80 + (i % 3) * 7 : null, unlockedAt: at(-45 + i * 7), completedAt: done ? at(-39 + i * 7) : null },
      });
    }
  }
  // Daily practice over the last week.
  for (let d = 0; d < 7; d++) {
    if (d >= (o.practice ?? 0)) break;
    const day = etDay(new Date(now - d * DAY));
    await prisma.fingerPracticeDay.upsert({ where: { userId_day: { userId: u.id, day } }, update: {}, create: { userId: u.id, day, seconds: 600, completedAt: new Date(now - d * DAY) } });
  }

  if (!o.plan && !o.canceled) continue;
  const term = o.plan ?? "MONTHLY";
  const termMonths = term === "MONTHLY" ? 1 : term === "TERM_3" ? 3 : 6;
  const list = term === "MONTHLY" ? 21999 : term === "TERM_3" ? 19799 : 17599;
  const amount = o.scholarship ? Math.round(list * (1 - o.scholarship / 100)) - (o.scholarship === 100 ? 0 : 0) : list;
  const win = windows[slotIdx % windows.length];
  const chunk = Math.floor(slotIdx / windows.length) % 3;
  slotIdx++;
  const existing = await prisma.paymentPlan.findFirst({ where: { userId: u.id } });
  const plan = existing ?? await prisma.paymentPlan.create({
    data: {
      userId: u.id, cadence: "MIN_60_WEEKLY", term, termMonths, installmentAmountCents: o.scholarship === 100 ? 0 : amount,
      listAmountCents: o.scholarship ? list : null, creditsPerInstallment: 8, installmentsPaid: o.paid ?? 0,
      nextDueDate: o.overdueDays ? at(-o.overdueDays) : at(o.paid ? 6 + (slotIdx % 14) : 0),
      status: o.canceled ? "CANCELED" : "ACTIVE", canceledAt: o.canceled ? at(-12) : null,
      reservedScheduleId: o.canceled ? null : win.id, reservedChunkIndex: o.canceled ? null : chunk,
      pausedAt: o.paused ? at(-3) : null, pauseUntil: o.paused ? at(18) : null,
      createdAt: at(-(o.paid ?? 1) * 28 - 2),
    },
  });
  if (existing) continue;

  // Paid bills.
  for (let n = 1; n <= (o.paid ?? 0); n++) {
    await prisma.zellePayment.create({
      data: { userId: u.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: n, amountCents: plan.installmentAmountCents, zelleHandle: "payments@bassnotepiano.com", status: "VERIFIED", senderName: name.toUpperCase(), matchedVia: n % 2 ? "code" : "name", submittedAt: at(-(o.paid - n + 1) * 28), reviewedAt: at(-(o.paid - n + 1) * 28, 15), checkedAt: n % 3 ? at(-(o.paid - n + 1) * 28, 16) : null, createdAt: at(-(o.paid - n + 1) * 28 - 1) },
    });
  }
  if ((o.paid ?? 0) > 0) {
    await prisma.creditGrant.create({ data: { userId: u.id, source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, creditsGranted: 8, creditsRemaining: (o.credits ?? 0) * 2, expiresAt: at(20) } });
  }
  const next = (o.paid ?? 0) + 1;
  if (o.pending) await prisma.zellePayment.create({ data: { userId: u.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: next, amountCents: amount, zelleHandle: "payments@bassnotepiano.com", status: "PENDING_REVIEW", senderName: name, referenceCode: "ZL83921", submittedAt: at(-1) } });
  if (o.overdueDays || o.awaiting) await prisma.zellePayment.create({ data: { userId: u.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: next, amountCents: amount, zelleHandle: "payments@bassnotepiano.com", status: "AWAITING_TRANSFER", createdAt: at(-(o.overdueDays ?? 0) - 3) } });
  if (o.rejected) await prisma.zellePayment.create({ data: { userId: u.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: next, amountCents: amount, zelleHandle: "payments@bassnotepiano.com", status: "REJECTED", rejectionReason: "The amount sent was $150.00, not $175.99.", submittedAt: at(-2), reviewedAt: at(-1) } });
}

// Classes: last week (some unmarked), today, and the rest of this week.
const active = created.filter(([, o]) => o.plan && !o.canceled && !o.paused && !o.awaiting);
let k = 0;
for (const [u, o] of active) {
  for (const offset of [-7, 0, 7]) {
    const win = windows[k % windows.length];
    const dayShift = offset === 0 ? (k % 3 === 0 ? 0 : (k % 3)) : offset + (k % 4);
    const when = at(dayShift, 21 + (k % 3));
    const occ = new Date(when); occ.setUTCHours(0, 0, 0, 0);
    const past = when.getTime() < now;
    await prisma.classBooking.upsert({
      where: { studentId_scheduleId_occurrenceDate: { studentId: u.id, scheduleId: win.id, occurrenceDate: occ } },
      update: {},
      create: { studentId: u.id, scheduleId: win.id, occurrenceDate: occ, scheduledAt: when, creditsSpent: 2, status: past && k % 4 !== 0 ? "COMPLETED" : "SCHEDULED", attendance: past && k % 4 !== 0 ? (k % 5 === 0 ? "NO_SHOW" : "PRESENT") : null, inPerson: k % 6 === 0 },
    });
  }
  k++;
}

// Unmatched bank emails.
for (const [i, [sender, cents, memo]] of [["JORDAN SMITH", 21999, "piano lessons"], ["MEKDES ASFAW", 17599, "BNP-7X2Q1"], ["ALEX P", 5000, null]].entries()) {
  await prisma.processedPaymentEmail.upsert({ where: { messageId: `<audit-${i}@bank.test>` }, update: {}, create: { messageId: `<audit-${i}@bank.test>`, method: "ZELLE", senderName: sender, amountCents: cents, memo, createdAt: at(-i - 1) } });
}

// Contacts and class form entries.
if (!(await prisma.contact.count())) {
  await prisma.contact.createMany({ data: [
    { name: "Bethlehem Wolde", phone: "+16175550199", email: "beth@example.com", instrument: "PIANO_KEYBOARD", status: "INTERESTED", source: "Instagram", notes: "Wants Saturday mornings." },
    { name: "Marcus Hill", phone: "+16175550142", status: "TRIAL", instrument: "GUITAR", source: "Referral" },
    { name: "Priya Nair", email: "priya@example.com", status: "PAUSED", instrument: "BASS", notes: "Back after the holidays." },
  ] });
  await prisma.classRegistration.createMany({ data: [
    { fullName: "Tomas Alvarez", email: "tomas@example.com", phone: "+16175550111", instrument: "PIANO_KEYBOARD", skillLevel: "BEGINNER", notes: "My daughter is 9 and wants to start piano.", createdAt: at(-1) },
    { fullName: "Eden Abebe", email: "eden@example.com", phone: "+16175550112", instrument: "GUITAR", skillLevel: "INTERMEDIATE", createdAt: at(-4) },
  ] });
}

// Support: an open chat, an open email, a resolved chat.
if (!(await prisma.assistantEscalation.count())) {
  const [liam] = created.find(([u]) => u.username === "liam");
  const chat = await prisma.assistantEscalation.create({ data: { identifier: "audit-chat-1", userId: liam.id, contactName: liam.name, contactEmail: liam.email, source: "CHAT", status: "OPEN", createdAt: at(-0.2) } });
  await prisma.supportMessage.createMany({ data: [
    { escalationId: chat.id, sender: "VISITOR", body: "I sent my payment yesterday but it still says I owe.", createdAt: at(-0.2) },
    { escalationId: chat.id, sender: "ATOM", body: "I can't see payments, so I'm handing you to the studio.", createdAt: at(-0.19) },
  ] });
  const mail = await prisma.assistantEscalation.create({ data: { identifier: "audit-mail-1", contactName: "Tomas Alvarez", contactEmail: "tomas@example.com", source: "EMAIL", subject: "Lessons for my daughter", status: "OPEN", createdAt: at(-1) } });
  await prisma.supportMessage.create({ data: { escalationId: mail.id, sender: "VISITOR", body: "Hi, do you teach 9 year olds? Saturdays would be best for us.", createdAt: at(-1) } });
  const done = await prisma.assistantEscalation.create({ data: { identifier: "audit-chat-2", contactEmail: "visitor@example.com", source: "CHAT", status: "RESOLVED", resolvedAt: at(-3), createdAt: at(-3.2) } });
  await prisma.supportMessage.createMany({ data: [
    { escalationId: done.id, sender: "VISITOR", body: "What time are classes on Wednesday?", createdAt: at(-3.2) },
    { escalationId: done.id, sender: "SUPPORT", sentById: owner.id, body: "5 to 7pm. Pick any open hour on the Lessons page.", createdAt: at(-3.1) },
  ] });
}

// Notes and a little activity.
for (const [u] of created.slice(0, 4)) {
  if (!(await prisma.studentNote.count({ where: { studentId: u.id } }))) await prisma.studentNote.create({ data: { studentId: u.id, authorId: owner.id, body: "Left hand is lagging on the descending run. Slow metronome work this week.", hiddenFromStudent: true } });
}
if (!(await prisma.auditLog.count())) {
  await prisma.auditLog.createMany({ data: created.slice(0, 6).map(([u], i) => ({ actorId: owner.id, actorEmail: owner.email, action: ["payment.approve", "plan.pause", "access.grant", "plan.move-time", "pricing.discount.set", "user.ban"][i], targetType: "User", targetId: u.id, detail: `audit seed ${i}`, createdAt: at(-i) })) });
}

console.log(`Seeded ${created.length} students. Password for every seeded account (this run only): ${PASSWORD}`);
console.log("Owner: owner@bnp.test   Staff: staff@bnp.test");
await prisma.$disconnect();
