import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { ingestPaymentEmail } from "@/lib/paymentEmail";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { forgetPayerName, listUnmatchedReceipts, matchReceiptToPayment } from "@/lib/paymentReceipts";
import { freshPhone, makeUser, newTag, prisma } from "./helpers";

const tag = newTag("pe");
let admin: { id: string; email: string };
const userIds: string[] = [];
const paymentIds: string[] = [];
let counter = 0;

async function student(name: string) {
  const user = await makeUser(`${tag}x${++counter}`, name, { classCredits: 0 });
  userIds.push(user.id);
  return user;
}

async function openPayment(userId: string, amountCents: number, status: "AWAITING_TRANSFER" | "PENDING_REVIEW" = "PENDING_REVIEW") {
  const p = await prisma.zellePayment.create({
    data: { userId, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents, zelleHandle: "pay@example.com", status, submittedAt: status === "PENDING_REVIEW" ? new Date() : null },
  });
  paymentIds.push(p.id);
  return p;
}

function zelleEmail(sender: string, dollars: string, memo?: string) {
  return ingestPaymentEmail({
    messageId: `${tag}-${++counter}`,
    from: "Bank of America <alerts@bankofamerica.com>",
    subject: `${sender} sent you $${dollars}`,
    body: `${sender} sent you $${dollars}\n${memo ?? ""}\nView your balance`.replace("\n\n", "\n"),
  });
}

/** An email whose body also shows a phone number for the sender (as some banks do). */
function emailWithPhone(sender: string, dollars: string, phoneLine: string) {
  return ingestPaymentEmail({
    messageId: `${tag}-${++counter}`,
    from: "Bank of America <alerts@bankofamerica.com>",
    subject: `${sender} sent you $${dollars}`,
    body: `${sender} sent you $${dollars}\nFrom ${phoneLine}\nView your balance`,
  });
}

/** A student with a typed-in phone number on file. */
async function studentWithPhone(name: string, phone: string | null) {
  const user = await student(name);
  await prisma.user.update({ where: { id: user.id }, data: { phone } });
  return user;
}

const status = async (id: string) => (await prisma.zellePayment.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  const a = await makeUser(tag, "Teacher", { role: "ADMIN" });
  admin = { id: a.id, email: a.email };
  userIds.push(a.id);
});
afterAll(async () => {
  await prisma.processedPaymentEmail.deleteMany({ where: { messageId: { startsWith: tag } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
  await prisma.zellePayment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("matching a bank email to a payment", () => {
  it("clears a payment when the name and exact amount match", async () => {
    const jordan = await student("Jordan Alemu");
    const p = await openPayment(jordan.id, 12301);
    expect(await zelleEmail("Jordan Alemu", "123.01")).toBe("approved");
    expect(await status(p.id)).toBe("VERIFIED");
  });

  it("leaves a parent's payment for a person when it carries no code", async () => {
    const kid = await student("Dawit Bekele");
    const p = await openPayment(kid.id, 12302);
    expect(await zelleEmail("Selam Bekele", "123.02")).toBe("stored");
    expect(await status(p.id)).toBe("PENDING_REVIEW");
  });

  it("clears a parent's payment when the note carries the payment's code", async () => {
    const kid = await student("Dawit Kebede");
    const p = await openPayment(kid.id, 12303);
    expect(await zelleEmail("Selam Kebede", "123.03", `lessons ${paymentReferenceCode(p.id)}`)).toBe("approved");
    expect(await status(p.id)).toBe("VERIFIED");
  });

  it("picks the right one of two students who share a name, by the code", async () => {
    const a = await student("Sam Tesfaye");
    const b = await student("Sam Tesfaye");
    const pa = await openPayment(a.id, 12304);
    const pb = await openPayment(b.id, 12304);
    expect(await zelleEmail("Sam Tesfaye", "123.04")).toBe("stored"); // no code: unclear, a person decides
    expect(await status(pa.id)).toBe("PENDING_REVIEW");
    expect(await zelleEmail("Sam Tesfaye", "123.04", paymentReferenceCode(pb.id))).toBe("approved");
    expect(await status(pb.id)).toBe("VERIFIED");
    expect(await status(pa.id)).toBe("PENDING_REVIEW");
  });

  it("does not settle a payment from an email that names a different payment's code", async () => {
    const a = await student("Lily Haile");
    const pa = await openPayment(a.id, 12305);
    expect(await zelleEmail("Lily Haile", "123.05", "BNP-ZZZZZ")).toBe("stored");
    expect(await status(pa.id)).toBe("PENDING_REVIEW");
  });
});

describe("remembering who pays for a student", () => {
  it("an admin's manual match saves the name, so the next payment clears by itself, until it is forgotten", async () => {
    const kid = await student("Abel Girma");
    const first = await openPayment(kid.id, 12306);
    expect(await zelleEmail("Tigist Girma", "123.06")).toBe("stored");
    const receipt = await prisma.processedPaymentEmail.findFirstOrThrow({ where: { messageId: { startsWith: tag }, senderName: "Tigist Girma", amountCents: 12306 } });
    await matchReceiptToPayment({ receiptId: receipt.id, paymentId: first.id, admin });
    expect(await status(first.id)).toBe("VERIFIED");
    const aliases = await prisma.payerAlias.findMany({ where: { userId: kid.id } });
    expect(aliases.map((a) => a.name)).toEqual(["Tigist Girma"]);

    const second = await openPayment(kid.id, 12307);
    expect(await zelleEmail("Tigist Girma", "123.07")).toBe("approved");
    expect(await status(second.id)).toBe("VERIFIED");

    await forgetPayerName({ aliasId: aliases[0].id, admin });
    const third = await openPayment(kid.id, 12308);
    expect(await zelleEmail("Tigist Girma", "123.08")).toBe("stored");
    expect(await status(third.id)).toBe("PENDING_REVIEW");
  });

  it("does not save the student's own name, or a one-word name", async () => {
    const kid = await student("Hanna Wolde");
    const p = await openPayment(kid.id, 12309);
    expect(await zelleEmail("Hanna Wolde", "123.09")).toBe("approved");
    const q = await openPayment(kid.id, 12310);
    expect(await zelleEmail("Mom", "123.10")).toBe("stored");
    const receipt = await prisma.processedPaymentEmail.findFirstOrThrow({ where: { messageId: { startsWith: tag }, senderName: "Mom" } });
    await matchReceiptToPayment({ receiptId: receipt.id, paymentId: q.id, admin });
    expect(await prisma.payerAlias.count({ where: { userId: kid.id } })).toBe(0);
    expect(await status(p.id)).toBe("VERIFIED");
  });
});

describe("a payment for the wrong amount", () => {
  it("tells the student, once, and leaves the payment alone", async () => {
    const kid = await student("Ruth Mekonnen");
    const p = await openPayment(kid.id, 12400);
    expect(await zelleEmail("Ruth Mekonnen", "99.00")).toBe("stored");
    expect(await status(p.id)).toBe("PENDING_REVIEW");
    const notes = await prisma.mailMessage.findMany({ where: { userId: kid.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/different amount/i);
    expect(notes[0].body).toContain("$99.00");
    expect(notes[0].body).toContain("$124.00");
  });

  it("says nothing when two people share the name (it is not clear whose money it is)", async () => {
    const a = await student("Tom Assefa");
    const b = await student("Tom Assefa");
    await openPayment(a.id, 12401);
    await openPayment(b.id, 12402);
    expect(await zelleEmail("Tom Assefa", "50.00")).toBe("stored");
    expect(await prisma.mailMessage.count({ where: { userId: { in: [a.id, b.id] } } })).toBe(0);
  });

  it("says nothing when the amount is right for a different open payment", async () => {
    const a = await student("Eden Tadesse");
    const b = await student("Noah Tadesse");
    await openPayment(a.id, 12403);
    await openPayment(b.id, 12404);
    expect(await zelleEmail("Eden Tadesse", "124.04")).toBe("stored");
    expect(await prisma.mailMessage.count({ where: { userId: a.id } })).toBe(0);
  });
});

describe("the phone number as a cross-check", () => {
  it("still settles a name match when the email's phone agrees with the number on file", async () => {
    const phone = freshPhone();
    const u = await studentWithPhone("Pia Phonelast", phone);
    const p = await openPayment(u.id, 14101);
    expect(await emailWithPhone("Pia Phonelast", "141.01", phone)).toBe("approved");
    expect(await status(p.id)).toBe("VERIFIED");
  });

  it("settles on the last four digits when the bank masks the rest", async () => {
    const phone = freshPhone();
    const u = await studentWithPhone("Mara Masked", phone);
    const p = await openPayment(u.id, 14102);
    expect(await emailWithPhone("Mara Masked", "141.02", `xxx-xxx-${phone.slice(-4)}`)).toBe("approved");
    expect(await status(p.id)).toBe("VERIFIED");
  });

  it("holds the payment for a person when the email's phone is a different number", async () => {
    const u = await studentWithPhone("Hal Holdit", freshPhone());
    const p = await openPayment(u.id, 14103);
    expect(await emailWithPhone("Hal Holdit", "141.03", freshPhone())).toBe("stored");
    expect(await status(p.id)).toBe("PENDING_REVIEW");
  });

  it("ignores the phone when the email has none, so nothing changes for most banks", async () => {
    const u = await studentWithPhone("Nora Nophone", freshPhone());
    const p = await openPayment(u.id, 14104);
    expect(await zelleEmail("Nora Nophone", "141.04")).toBe("approved");
    expect(await status(p.id)).toBe("VERIFIED");
  });

  it("never settles on the phone alone", async () => {
    const phone = freshPhone();
    const u = await studentWithPhone("Sole Solo", phone);
    const p = await openPayment(u.id, 14105);
    expect(await emailWithPhone("Totally Different", "141.05", phone)).toBe("stored");
    expect(await status(p.id)).toBe("PENDING_REVIEW");
  });

  it("points the admin at the student whose number agrees, listed first", async () => {
    const phone = freshPhone();
    const other = await studentWithPhone("Otto Other", freshPhone());
    const match = await studentWithPhone("Mina Match", phone);
    await openPayment(other.id, 14106);
    const target = await openPayment(match.id, 14106);
    await emailWithPhone("Parent Payer", "141.06", phone); // a parent pays: the name matches nobody
    const rows = await listUnmatchedReceipts(new Date(Date.now() + 2 * 60 * 60 * 1000));
    const row = rows.find((r) => r.amountCents === 14106 && r.senderName === "Parent Payer");
    expect(row).toBeDefined();
    expect(row!.senderPhoneLast4).toBe(phone.slice(-4));
    expect(row!.candidates[0]).toMatchObject({ id: target.id, phoneMatch: true });
    expect(row!.candidates.filter((c) => c.phoneMatch)).toHaveLength(1);
  });
});
