import { describe, expect, it } from "vitest";
import { checkForwardedBankMail, dkimSignatureDomains, domainAligned, emailBodyText, isPaymentInboxRecipient, normalizeMessageId } from "@/lib/paymentInbound";

const TOKEN = "a1b2c3d4e5f60718293a4b5c";
const headers = (...sigs: string[]) => JSON.stringify(sigs.map((v) => ["DKIM-Signature", v]));

describe("the private payments address", () => {
  it("accepts only pay-<token> on the studio domain or a subdomain", () => {
    expect(isPaymentInboxRecipient(`pay-${TOKEN}@inbox.bassnotepiano.com`, TOKEN)).toBe(true);
    expect(isPaymentInboxRecipient(`PAY-${TOKEN}@bassnotepiano.com`, TOKEN)).toBe(true);
    expect(isPaymentInboxRecipient(`pay-wrong${TOKEN.slice(5)}@inbox.bassnotepiano.com`, TOKEN)).toBe(false);
    expect(isPaymentInboxRecipient(`music@inbox.bassnotepiano.com`, TOKEN)).toBe(false);
    expect(isPaymentInboxRecipient(`pay-${TOKEN}@evil.com`, TOKEN)).toBe(false);
    expect(isPaymentInboxRecipient(`pay-${TOKEN}@bassnotepiano.com.evil.com`, TOKEN)).toBe(false);
  });
  it("is off when no usable token is configured", () => {
    expect(isPaymentInboxRecipient(`pay-@inbox.bassnotepiano.com`, undefined)).toBe(false);
    expect(isPaymentInboxRecipient(`pay-short@inbox.bassnotepiano.com`, "short")).toBe(false);
  });
});

describe("a forwarded bank email's own signature", () => {
  it("reads every DKIM signature's domain", () => {
    expect(dkimSignatureDomains(headers("v=1; a=rsa-sha256; d=sofi.com; s=x; b=abc", "v=1; d=Mail.Other.com; s=y"))).toEqual(["sofi.com", "mail.other.com"]);
    expect(dkimSignatureDomains("not json")).toEqual([]);
    expect(dkimSignatureDomains(null)).toEqual([]);
  });
  it("aligns a signed domain with the sender's own domain or its parent", () => {
    expect(domainAligned("sofi.com", "sofi.com")).toBe(true);
    expect(domainAligned("sofi.com", "notifications.sofi.com")).toBe(true);
    expect(domainAligned("evil.com", "sofi.com")).toBe(false);
    expect(domainAligned("sofi.com", "notsofi.com")).toBe(false);
  });
  it("passes only when Mailgun's check passed AND a signature belongs to the sender", () => {
    const good = headers("v=1; d=sofi.com; s=x");
    expect(checkForwardedBankMail({ fromEmail: "no-reply@sofi.com", dkimResult: "Pass", rawHeaders: good })).toEqual({ ok: true });
    expect(checkForwardedBankMail({ fromEmail: "no-reply@sofi.com", dkimResult: "Fail", rawHeaders: good }).ok).toBe(false);
    expect(checkForwardedBankMail({ fromEmail: "no-reply@sofi.com", dkimResult: undefined, rawHeaders: good }).ok).toBe(false);
    // Validly signed by someone else, with a forged From: refused.
    expect(checkForwardedBankMail({ fromEmail: "no-reply@sofi.com", dkimResult: "Pass", rawHeaders: headers("v=1; d=attacker.com") }).ok).toBe(false);
    expect(checkForwardedBankMail({ fromEmail: "no-reply@sofi.com", dkimResult: "Pass", rawHeaders: "[]" }).ok).toBe(false);
  });
});

describe("message ids and bodies", () => {
  it("makes one id of the same email however it was read", () => {
    expect(normalizeMessageId(" <ABC.123@mail.sofi.com> ")).toBe("abc.123@mail.sofi.com");
    expect(normalizeMessageId("abc.123@mail.sofi.com")).toBe("abc.123@mail.sofi.com");
  });
  it("uses the plain part, or strips the HTML when there is none", () => {
    expect(emailBodyText("Hello", "<p>x</p>")).toBe("Hello");
    expect(emailBodyText("", "<style>p{}</style><p>The $199.99 sent to you by Jo&nbsp;Doe</p><br>Note: BNP-ABCDE")).toBe("The $199.99 sent to you by Jo Doe\nNote: BNP-ABCDE");
  });
});
