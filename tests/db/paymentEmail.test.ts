import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { ingestPaymentEmail } from "@/lib/paymentEmail";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { forgetPayerName, listUnmatchedReceipts, matchReceiptToPayment } from "@/lib/paymentReceipts";
import { checkPaymentPhone, getPaymentPhoneState, savePaymentPhone } from "@/lib/paymentPhone";
import { resetSetting, saveSetting } from "@/lib/siteSettings";
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

async function openPayment(userId: string, amountCents: number, status: "AWAITING_TRANSFER" | "PENDING_REVIEW" = "PENDING_REVIEW", senderPhone: string | null = null) {
  const p = await prisma.zellePayment.create({
    data: { userId, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents, zelleHandle: "pay@example.com", status, senderPhone, submittedAt: status === "PENDING_REVIEW" ? new Date() : null },
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
  // The older tests below are about code, name and phone matching; the exact-amount rule has its own tests.
  await saveSetting("payments.matchByAmount", false);
  const a = await makeUser(tag, "Teacher", { role: "ADMIN" });
  admin = { id: a.id, email: a.email };
  userIds.push(a.id);
});
afterAll(async () => {
  await resetSetting("payments.matchByAmount");
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

describe("the phone number asked when paying", () => {
  it("clears a payment from the number typed for it, even when the name on the email is someone else's, and leaves it to be checked", async () => {
    const phone = freshPhone();
    const kid = await student("Kai Child");
    const p = await openPayment(kid.id, 15001, "AWAITING_TRANSFER", phone);
    expect(await emailWithPhone("Parent Payer", "150.01", phone)).toBe("approved");
    const row = await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("VERIFIED");
    // A settlement that rested on a typed number alone is not marked confirmed: it waits in the unchecked list.
    expect([row.autoApproved, row.checkedAt]).toEqual([true, null]);
  });

  it("a name match with the right number is confirmed as before", async () => {
    const phone = freshPhone();
    const u = await student("Nia Namer");
    const p = await openPayment(u.id, 15002, "AWAITING_TRANSFER", phone);
    expect(await emailWithPhone("Nia Namer", "150.02", phone)).toBe("approved");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).checkedAt).not.toBeNull();
  });

  it("two students who typed the same number settle nothing from it", async () => {
    const phone = freshPhone();
    const victim = await student("Vera Victim");
    const thief = await student("Theo Thief");
    const a = await openPayment(victim.id, 15003, "AWAITING_TRANSFER", phone);
    const b = await openPayment(thief.id, 15003, "AWAITING_TRANSFER", phone);
    expect(await emailWithPhone("Someone Else", "150.03", phone)).toBe("stored");
    expect([await status(a.id), await status(b.id)]).toEqual(["AWAITING_TRANSFER", "AWAITING_TRANSFER"]);
  });

  it("a different number than the one typed settles nothing", async () => {
    const u = await student("Dina Different");
    const p = await openPayment(u.id, 15004, "AWAITING_TRANSFER", freshPhone());
    expect(await emailWithPhone("Parent Payer", "150.04", freshPhone())).toBe("stored");
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("a name match is held when the number on the email is not the one typed for the payment", async () => {
    const u = await student("Hugo Held");
    const p = await openPayment(u.id, 15005, "AWAITING_TRANSFER", freshPhone());
    expect(await emailWithPhone("Hugo Held", "150.05", freshPhone())).toBe("stored");
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("stores the number on the student's own open payment, and fills the account's number when it had none", async () => {
    const u = await student("Sia Saver");
    const p = await openPayment(u.id, 15006, "AWAITING_TRANSFER");
    const phone = freshPhone();
    // Off by default (bank emails carry no sender phone); the owner can switch it on.
    expect(await getPaymentPhoneState(u.id, p.id)).toMatchObject({ ask: false, paymentPhone: null, hasAccountPhone: false, accountPhoneLast4: null });
    await saveSetting("payments.askPhone", true);
    expect(await getPaymentPhoneState(u.id, p.id)).toMatchObject({ ask: true });
    await resetSetting("payments.askPhone");
    expect(await savePaymentPhone(u.id, p.id, phone)).toEqual({ ok: true, phone });
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).senderPhone).toBe(phone);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).phone).toBe(phone);
    expect((await getPaymentPhoneState(u.id, p.id))?.paymentPhone).toBe(phone);
  });

  it("an account that has a number can only pay with that number, and the sheet is told only its last four digits", async () => {
    const own = freshPhone();
    const u = await studentWithPhone("Mona Match", own);
    const p = await openPayment(u.id, 15008, "AWAITING_TRANSFER");
    const state = await getPaymentPhoneState(u.id, p.id);
    expect(state).toMatchObject({ hasAccountPhone: true, accountPhoneLast4: own.slice(-4) });
    expect(JSON.stringify(state)).not.toContain(own);
    expect(await checkPaymentPhone(u.id, own)).toEqual({ status: "match" });
    expect(await checkPaymentPhone(u.id, freshPhone())).toEqual({ status: "mismatch" });
    expect((await savePaymentPhone(u.id, p.id, freshPhone())).ok).toBe(false);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).senderPhone).toBeNull();
    expect(await savePaymentPhone(u.id, p.id, own)).toEqual({ ok: true, phone: own });
  });

  it("cannot borrow a number that is on someone else's account", async () => {
    const taken = freshPhone();
    await studentWithPhone("Holder Hana", taken);
    const thief = await student("Thief Theo");
    const p = await openPayment(thief.id, 15009, "AWAITING_TRANSFER");
    expect(await checkPaymentPhone(thief.id, taken)).toEqual({ status: "taken" });
    expect((await savePaymentPhone(thief.id, p.id, taken)).ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: thief.id } })).phone).toBeNull();
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).senderPhone).toBeNull();
  });

  it("flags a typo or fake number as not real before anything is saved", async () => {
    const u = await student("Tina Typo");
    const p = await openPayment(u.id, 15010, "AWAITING_TRANSFER");
    expect(await checkPaymentPhone(u.id, "(555) 234-5678")).toMatchObject({ status: "invalid" });
    expect(await checkPaymentPhone(u.id, "123")).toMatchObject({ status: "invalid" });
    expect((await savePaymentPhone(u.id, p.id, "(555) 234-5678")).ok).toBe(false);
  });

  it("will not store a number on someone else's payment, a closed one, or a fake number", async () => {
    const owner = await student("Olga Owner");
    const other = await student("Otis Other");
    const p = await openPayment(owner.id, 15007, "AWAITING_TRANSFER");
    expect((await savePaymentPhone(other.id, p.id, freshPhone())).ok).toBe(false);
    expect(await getPaymentPhoneState(other.id, p.id)).toBeNull();
    expect((await savePaymentPhone(owner.id, p.id, "(555) 234-5678")).ok).toBe(false);
    await prisma.zellePayment.update({ where: { id: p.id }, data: { status: "REJECTED" } });
    expect((await savePaymentPhone(owner.id, p.id, freshPhone())).ok).toBe(false);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).senderPhone).toBeNull();
  });
});

/** A SoFi Zelle email: the real wording, with an invented sender. */
function sofiEmail(sender: string, dollars: string, note?: string) {
  return ingestPaymentEmail({
    messageId: `${tag}-${++counter}`,
    from: "SoFi <no-reply@sofi.com>",
    subject: "You received money with Zelle",
    body: [
      "SoFi together with Zelle",
      sender,
      `The $${dollars} sent to you by ${sender} will be automatically deposited to your account.`,
      note ?? "",
      "SoFi is not responsible for the content of the personal message.",
      "Privacy and Security:",
      "ReferenceID (333333333)",
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

const row = async (id: string) => prisma.zellePayment.findUniqueOrThrow({ where: { id } });

describe("clearing a payment by its exact amount", () => {
  beforeAll(async () => {
    await saveSetting("payments.matchByAmount", true);
  });

  it("reads a SoFi email and clears a name match as confirmed", async () => {
    const u = await student("Selma Sofi");
    const p = await openPayment(u.id, 19901, "AWAITING_TRANSFER");
    expect(await sofiEmail("SELMA SOFI", "199.01")).toBe("approved");
    const r = await row(p.id);
    expect([r.status, r.matchedVia]).toEqual(["VERIFIED", "name"]);
    expect(r.checkedAt).not.toBeNull();
    expect(r.senderName).toBe("SELMA SOFI");
  });

  it("clears a payment by the code in the note, whatever the name", async () => {
    const u = await student("Cody Coder");
    const p = await openPayment(u.id, 19902, "AWAITING_TRANSFER");
    expect(await sofiEmail("A PARENT", "199.02", `lessons ${paymentReferenceCode(p.id)}`)).toBe("approved");
    expect((await row(p.id)).matchedVia).toBe("code");
  });

  it("clears the one open payment for an amount even when the name matches nobody, and leaves it to be checked", async () => {
    const u = await student("Kiddo Student");
    const p = await openPayment(u.id, 19903, "AWAITING_TRANSFER");
    expect(await sofiEmail("SOME PARENT", "199.03", "Guitar LessonMonthly")).toBe("approved");
    const r = await row(p.id);
    expect([r.status, r.matchedVia, r.autoApproved, r.checkedAt]).toEqual(["VERIFIED", "amount", true, null]);
  });

  it("does nothing when two payments are open for the same amount and the name settles neither", async () => {
    const a = await openPayment((await student("Twin Alpha")).id, 19904, "AWAITING_TRANSFER");
    const b = await openPayment((await student("Twin Beta")).id, 19904, "AWAITING_TRANSFER");
    expect(await sofiEmail("NOBODY KNOWN", "199.04")).toBe("stored");
    expect([await status(a.id), await status(b.id)]).toEqual(["AWAITING_TRANSFER", "AWAITING_TRANSFER"]);
  });

  it("leaves it alone when the sender is a known person on a different account", async () => {
    await student("Priya Known");
    const owner = await student("Opal Opener");
    const p = await openPayment(owner.id, 19905, "AWAITING_TRANSFER");
    expect(await sofiEmail("PRIYA KNOWN", "199.05")).toBe("stored");
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("also leaves it alone when the sender is a payer name an admin confirmed for someone else", async () => {
    const holder = await student("Hana Holder");
    await prisma.payerAlias.create({ data: { userId: holder.id, name: "Grandma Holder" } });
    const owner = await student("Olaf Other");
    const p = await openPayment(owner.id, 19906, "AWAITING_TRANSFER");
    expect(await sofiEmail("GRANDMA HOLDER", "199.06")).toBe("stored");
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("leaves it alone when the note names a different payment", async () => {
    const u = await student("Nora Note");
    const p = await openPayment(u.id, 19907, "AWAITING_TRANSFER");
    expect(await sofiEmail("SOME PARENT", "199.07", "BNP-ZZZZZ")).toBe("stored");
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("ignores a payment opened long ago, so a stale one is not claimed by chance", async () => {
    const u = await student("Stella Stale");
    const p = await openPayment(u.id, 19908, "AWAITING_TRANSFER");
    await prisma.zellePayment.update({ where: { id: p.id }, data: { createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000) } });
    expect(await sofiEmail("SOME PARENT", "199.08")).toBe("stored");
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("never claims a payment of a different amount", async () => {
    const u = await student("Amy Amount");
    const p = await openPayment(u.id, 19909, "AWAITING_TRANSFER");
    expect(await sofiEmail("SOME PARENT", "199.10")).toBe("stored");
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("waits for the owner when the setting is off", async () => {
    const u = await student("Ollie Off");
    const p = await openPayment(u.id, 19911, "AWAITING_TRANSFER");
    await saveSetting("payments.matchByAmount", false);
    expect(await sofiEmail("SOME PARENT", "199.11")).toBe("stored");
    await saveSetting("payments.matchByAmount", true);
    expect(await status(p.id)).toBe("AWAITING_TRANSFER");
  });

  it("an email can only clear one payment", async () => {
    const u = await student("Once Only");
    const p = await openPayment(u.id, 19912, "AWAITING_TRANSFER");
    expect(await sofiEmail("SOME PARENT", "199.12")).toBe("approved");
    expect(await sofiEmail("SOME PARENT", "199.12")).toBe("stored"); // the second email has nothing left to clear
    expect(await status(p.id)).toBe("VERIFIED");
  });
});
