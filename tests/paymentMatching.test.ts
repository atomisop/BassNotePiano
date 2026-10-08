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
