import { describe, expect, it } from "vitest";
import { pickMatchingPayment, receiptMatchesPayment } from "@/lib/paymentEmail";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { pipelineProblem } from "@/lib/paymentPipelineStatus";

type P = Parameters<typeof receiptMatchesPayment>[0];
const pay = (id: string, name: string | null, amountCents = 9999, aliases: string[] = []): P => ({
  id,
  status: "PENDING_REVIEW",
  amountCents,
  senderName: null,
  user: { name, payerAliases: aliases.map((alias) => ({ name: alias })) },
});
const email = (senderName: string, amountCents = 9999, memo: string | null = null) => ({ senderName, amountCents, memo });

const A = "cuid-student-a-00001";
const B = "cuid-student-b-00002";

describe("receiptMatchesPayment", () => {
  it("matches the account holder's name and the exact amount", () => {
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu"), email("Jordan Alemu"))).toBe(true);
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu"), email("Jordan T Alemu"))).toBe(true);
  });
  it("never matches a different amount, even with the right code", () => {
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu"), email("Jordan Alemu", 9900))).toBe(false);
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu"), email("Someone Else", 9900, paymentReferenceCode(A)))).toBe(false);
  });
  it("does not match someone else's name", () => {
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu"), email("Maria Alemu"))).toBe(false);
  });
  it("matches a parent paying when the note carries the payment's code", () => {
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu"), email("Maria Alemu", 9999, `Jordan lessons ${paymentReferenceCode(A)}`))).toBe(true);
  });
  it("matches a single-word account name when the code is there", () => {
    expect(receiptMatchesPayment(pay(A, "Bob"), email("Robert Smith", 9999, paymentReferenceCode(A)))).toBe(true);
    expect(receiptMatchesPayment(pay(A, "Bob"), email("Robert Smith"))).toBe(false);
  });
  it("matches a confirmed alias, but only with two words", () => {
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu", 9999, ["Maria Alemu"]), email("Maria Alemu"))).toBe(true);
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu", 9999, ["Maria"]), email("Maria"))).toBe(false);
  });
  it("does not let the right name claim money meant for another payment", () => {
    expect(receiptMatchesPayment(pay(A, "Jordan Alemu"), email("Jordan Alemu", 9999, paymentReferenceCode(B)))).toBe(false);
  });
});

describe("pickMatchingPayment", () => {
  it("picks the only match", () => {
    const list = [pay(A, "Jordan Alemu"), pay(B, "Sam Tesfaye")];
    expect(pickMatchingPayment(list, email("Sam Tesfaye"))?.id).toBe(B);
  });
  it("picks nothing when nobody matches", () => {
    expect(pickMatchingPayment([pay(A, "Jordan Alemu")], email("Stranger Person"))).toBeNull();
  });
  it("picks nothing when two students share the name and there is no code", () => {
    const list = [pay(A, "Jordan Alemu"), pay(B, "Jordan Alemu")];
    expect(pickMatchingPayment(list, email("Jordan Alemu"))).toBeNull();
  });
  it("picks the right one of two same-name students by the code", () => {
    const list = [pay(A, "Jordan Alemu"), pay(B, "Jordan Alemu")];
    expect(pickMatchingPayment(list, email("Jordan Alemu", 9999, paymentReferenceCode(B)))?.id).toBe(B);
  });
  it("a code beats a name that points at another payment", () => {
    const list = [pay(A, "Jordan Alemu"), pay(B, "Sam Tesfaye")];
    expect(pickMatchingPayment(list, email("Jordan Alemu", 9999, paymentReferenceCode(B)))?.id).toBe(B);
  });
  it("a code for a payment that is not open settles nothing", () => {
    expect(pickMatchingPayment([pay(A, "Jordan Alemu")], email("Jordan Alemu", 9999, "BNP-ZZZZZ"))).toBeNull();
  });
});

describe("pipelineProblem", () => {
  it("is a constant line only when quiet", () => {
    expect(pipelineProblem({ status: "ok" })).toBeNull();
    const line = pipelineProblem({ status: "quiet" });
    expect(line).toContain("payment emails");
    expect(pipelineProblem({ status: "quiet" })).toBe(line);
  });
});

import { extractPhoneClues, namesMatch, parsePaymentEmail, parseSofi, phoneAgrees, phoneConflicts, pickMatch, receiptMatchVia } from "@/lib/paymentEmail";

const payWithPhone = (id: string, name: string, phone: string | null): P => ({ ...pay(id, name), user: { name, phone, payerAliases: [] } });
const withPhone = (senderName: string, senderPhone: string | null, senderPhoneLast4: string | null = null, memo: string | null = null) => ({
  senderName,
  amountCents: 9999,
  memo,
  senderPhone,
  senderPhoneLast4,
});

describe("extractPhoneClues", () => {
  it("reads a phone written like a phone number", () => {
    expect(extractPhoneClues("Jordan Alemu (347) 419-7648 sent you $25").phone).toBe("+13474197648");
    expect(extractPhoneClues("from 347-419-7648").phone).toBe("+13474197648");
    expect(extractPhoneClues("from +1 347 419 7648").phone).toBe("+13474197648");
    expect(extractPhoneClues("Mobile: 3474197648").phone).toBe("+13474197648");
  });
  it("reads only the last four of a masked number", () => {
    expect(extractPhoneClues("Sent from xxx-xxx-7648")).toEqual({ phone: null, last4: "7648" });
    expect(extractPhoneClues("Sent from (***) ***-7648")).toEqual({ phone: null, last4: "7648" });
    expect(extractPhoneClues("Sent from •••-•••-7648")).toEqual({ phone: null, last4: "7648" });
    expect(extractPhoneClues("phone number ending in 7648")).toEqual({ phone: null, last4: "7648" });
  });
  it("does not mistake amounts, dates or long ids for a phone number", () => {
    expect(extractPhoneClues("Jordan Alemu sent you $2,500.00")).toEqual({ phone: null, last4: null });
    expect(extractPhoneClues("Confirmation number 3474197648")).toEqual({ phone: null, last4: null });
    expect(extractPhoneClues("Sent on 2026-10-09 at 4:15 PM")).toEqual({ phone: null, last4: null });
  });
  it("is attached to a parsed email only when one is there", () => {
    const withIt = parsePaymentEmail("Jordan Alemu sent you $25.00", "Jordan Alemu sent you $25.00\nFrom (347) 419-7648\nView your balance");
    expect(withIt?.senderPhone).toBe("+13474197648");
    const without = parsePaymentEmail("Jordan Alemu sent you $25.00", "Jordan Alemu sent you $25.00\nView your balance");
    expect([without?.senderPhone, without?.senderPhoneLast4]).toEqual([null, null]);
  });
});

describe("phone as a cross-check, never an approval", () => {
  const phone = "+13474197648";
  it("a matching phone changes nothing: the name still decides", () => {
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", phone), withPhone("Jordan Alemu", phone))).toBe(true);
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", phone), withPhone("Maria Alemu", phone))).toBe(false);
  });
  it("a phone alone never settles a payment", () => {
    expect(pickMatchingPayment([payWithPhone(A, "Jordan Alemu", phone)], withPhone("Stranger Person", phone))).toBeNull();
  });
  it("a different phone holds a name match for a person to look at", () => {
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", phone), withPhone("Jordan Alemu", "+12125550142"))).toBe(false);
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", phone), withPhone("Jordan Alemu", null, "0000"))).toBe(false);
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", phone), withPhone("Jordan Alemu", null, "7648"))).toBe(true);
  });
  it("no phone on either side means no opinion", () => {
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", null), withPhone("Jordan Alemu", phone))).toBe(true);
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", phone), withPhone("Jordan Alemu", null))).toBe(true);
  });
  it("the payment's own code outranks the phone clue", () => {
    const memo = `lessons ${paymentReferenceCode(A)}`;
    expect(receiptMatchesPayment(payWithPhone(A, "Jordan Alemu", phone), withPhone("Maria Alemu", "+12125550142", null, memo))).toBe(true);
  });
  it("helpers agree with each other", () => {
    expect(phoneConflicts(phone, { senderName: "x", amountCents: 1, memo: null, senderPhone: "+12125550142" })).toBe(true);
    expect(phoneAgrees(phone, { senderPhone: phone })).toBe(true);
    expect(phoneAgrees(phone, { senderPhoneLast4: "7648" })).toBe(true);
    expect(phoneAgrees(null, { senderPhone: phone })).toBe(false);
    expect(phoneAgrees(phone, {})).toBe(false);
  });
});

describe("the phone typed when paying", () => {
  const typed = "+13474197648";
  const payTyped = (id: string, name: string, senderPhone: string | null, accountPhone: string | null = null): P => ({
    ...pay(id, name),
    senderPhone,
    user: { name, phone: accountPhone, payerAliases: [] },
  });

  it("finds the payment by the whole number even when the name is someone else's", () => {
    expect(receiptMatchVia(payTyped(A, "Jordan Alemu", typed), withPhone("Parent Payer", typed))).toBe("phone");
  });
  it("a masked last four never finds a payment on its own", () => {
    expect(receiptMatchVia(payTyped(A, "Jordan Alemu", typed), withPhone("Parent Payer", null, "7648"))).toBeNull();
  });
  it("a different number finds nothing", () => {
    expect(receiptMatchVia(payTyped(A, "Jordan Alemu", typed), withPhone("Parent Payer", "+12125550142"))).toBeNull();
  });
  it("the amount still has to match exactly", () => {
    expect(receiptMatchVia(payTyped(A, "Jordan Alemu", typed), { ...withPhone("Parent Payer", typed), amountCents: 100 })).toBeNull();
  });
  it("the code and a name are stronger ways in than the phone", () => {
    expect(receiptMatchVia(payTyped(A, "Jordan Alemu", typed), withPhone("Maria Alemu", typed, null, `x ${paymentReferenceCode(A)}`))).toBe("code");
    expect(receiptMatchVia(payTyped(A, "Jordan Alemu", typed), withPhone("Jordan Alemu", typed))).toBe("name");
  });
  it("a name match is held when the number typed for the payment is not the one on the email", () => {
    expect(receiptMatchVia(payTyped(A, "Jordan Alemu", typed, "+12125550142"), withPhone("Jordan Alemu", "+12125550142"))).toBeNull();
  });
  it("two payments claiming one number settle nothing, so claiming someone's number cannot steal their money", () => {
    const list = [payTyped(A, "Jordan Alemu", typed), payTyped(B, "Sam Tesfaye", typed)];
    expect(pickMatch(list, withPhone("Parent Payer", typed))).toBeNull();
  });
  it("reports how a payment was found", () => {
    expect(pickMatch([payTyped(A, "Jordan Alemu", typed)], withPhone("Parent Payer", typed))?.via).toBe("phone");
    expect(pickMatch([payTyped(A, "Jordan Alemu", typed)], withPhone("Jordan Alemu", null))?.via).toBe("name");
  });
});

// The shape of SoFi's Zelle email (the real one's name and IDs are not copied; these are invented).
const sofiBody = (name: string, dollars: string, note: string | null) =>
  [
    "SoFi together with Zelle",
    name,
    `The $${dollars} sent to you by ${name} will be automatically deposited to your account.`,
    ...(note ? [note] : []),
    "SoFi is not responsible for the content of the personal message. SoFi cannot protect against the receipt of material in the personal message that may be offensive.",
    "Privacy and Security:",
    "Your trust and security are our highest priorities.",
    "Contact Us:",
    "MemberID (11111111)",
    "AlertID (2222222222)",
    "ReferenceID (333333333)",
  ].join("\n");

describe("reading SoFi's Zelle email", () => {
  it("reads the sender, the exact amount and the note", () => {
    const parsed = parseSofi(sofiBody("JORDAN ALEMU", "199.99", "Guitar LessonMonthly"));
    expect(parsed).toEqual({ method: "ZELLE", name: "JORDAN ALEMU", amountCents: 19999, memo: "Guitar LessonMonthly" });
  });
  it("has no note when the sender wrote none, and never mistakes SoFi's own wording for one", () => {
    expect(parseSofi(sofiBody("JORDAN ALEMU", "199.99", null))?.memo).toBeNull();
  });
  it("does not need to know the subject line, whatever it says", () => {
    for (const subject of ["You received money with Zelle", "JORDAN ALEMU sent you money", "Zelle deposit", ""]) {
      expect(parsePaymentEmail(subject, sofiBody("JORDAN ALEMU", "1,250.00", "BNP-4K7Q2"))).toMatchObject({ name: "JORDAN ALEMU", amountCents: 125000, memo: "BNP-4K7Q2" });
    }
  });
  it("copes with a name that wraps onto a second line", () => {
    const wrapped = sofiBody("MARIA ANTOINETTE ALEMU", "199.99", null).replace("MARIA ANTOINETTE ALEMU will", "MARIA ANTOINETTE\nALEMU will");
    expect(parseSofi(wrapped)?.name).toBe("MARIA ANTOINETTE ALEMU");
  });
  it("ignores SoFi emails that are not a payment", () => {
    expect(parseSofi("Your statement is ready. Sign in to view it.")).toBeNull();
    expect(parsePaymentEmail("Your SoFi statement", "Your statement is ready.")).toBeNull();
  });
  it("still reads the Bank of America wording", () => {
    expect(parsePaymentEmail("Jordan Alemu sent you $25.00", "Jordan Alemu sent you $25.00\nBNP-4K7Q2\nView your balance")).toMatchObject({ name: "Jordan Alemu", amountCents: 2500, memo: "BNP-4K7Q2" });
  });
});

describe("names as banks and people write them", () => {
  it("ignores capitals, middle names and order of extra words", () => {
    expect(namesMatch("Meshesha Tessema", "MESHESHA TESSEMA")).toBe(true);
    expect(namesMatch("Meshesha Tessema", "MESHESHA T TESSEMA")).toBe(true);
  });
  it("lets an initial stand for the word it starts, but never two initials alone", () => {
    expect(namesMatch("Meshesha T", "MESHESHA TESSEMA")).toBe(true);
    expect(namesMatch("J A", "JORDAN ALEMU")).toBe(false);
    expect(namesMatch("Jordan A", "JORDAN ALEMU")).toBe(true);
  });
  it("does not match a different person", () => {
    expect(namesMatch("Meshesha Tessema", "MESHESHA ALEMU")).toBe(false);
    expect(namesMatch("Meshesha", "MESHESHA TESSEMA")).toBe(false);
  });
});
