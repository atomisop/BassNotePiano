import { describe, expect, it } from "vitest";
import { checkForwardedBankMail, gmailSawBankSignature } from "@/lib/paymentInbound";

const headers = (arc: string) => JSON.stringify([["ARC-Authentication-Results", arc], ["Subject", "x"]]);

describe("what Gmail recorded about the bank's signature", () => {
  it("sees a passing signature from the sender's own domain on the first hop", () => {
    const h = headers("i=1; mx.google.com; dkim=pass header.i=@o.sofi.org header.s=s1 header.b=abc; spf=pass smtp.mailfrom=o.sofi.org");
    expect(gmailSawBankSignature(h, "no-reply@o.sofi.org")).toBe(true);
    expect(gmailSawBankSignature(h, "no-reply@notifications.o.sofi.org")).toBe(true);
  });
  it("does not for another domain, a failed result, a later hop, or no header", () => {
    expect(gmailSawBankSignature(headers("i=1; mx.google.com; dkim=pass header.i=@evil.example"), "no-reply@o.sofi.org")).toBe(false);
    expect(gmailSawBankSignature(headers("i=1; mx.google.com; dkim=fail header.i=@o.sofi.org"), "no-reply@o.sofi.org")).toBe(false);
    expect(gmailSawBankSignature(headers("i=2; mx.google.com; dkim=pass header.i=@o.sofi.org"), "no-reply@o.sofi.org")).toBe(false);
    expect(gmailSawBankSignature(null, "no-reply@o.sofi.org")).toBe(false);
    expect(gmailSawBankSignature("not json", "no-reply@o.sofi.org")).toBe(false);
  });
  it("is only a hint: a failed Mailgun check stays failed, with the hint attached", () => {
    const h = headers("i=1; mx.google.com; dkim=pass header.i=@o.sofi.org");
    const check = checkForwardedBankMail({ fromEmail: "no-reply@o.sofi.org", dkimResult: "fail", rawHeaders: h });
    expect(check.ok).toBe(false);
    expect(check.gmailSawBankSignature).toBe(true);
  });
});

describe("an email Mailgun gave no verdict on", () => {
  const signed = (arc: string, d = "o.sofi.org") => JSON.stringify([["DKIM-Signature", `v=1; a=rsa-sha256; d=${d}; s=x; b=abc`], ["ARC-Authentication-Results", arc]]);
  const arc = "i=1; mx.google.com; dkim=pass header.i=@o.sofi.org";
  it("is soft-trusted when the bank's signature is on it AND Gmail saw it pass", () => {
    const check = checkForwardedBankMail({ fromEmail: "no-reply@o.sofi.org", dkimResult: undefined, rawHeaders: signed(arc) });
    expect(check).toMatchObject({ ok: false, soft: true });
  });
  it("is not soft-trusted with an explicit failure, another domain's signature, or no Gmail hint", () => {
    expect(checkForwardedBankMail({ fromEmail: "no-reply@o.sofi.org", dkimResult: "fail", rawHeaders: signed(arc) }).soft).toBe(false);
    expect(checkForwardedBankMail({ fromEmail: "no-reply@o.sofi.org", dkimResult: undefined, rawHeaders: signed(arc, "evil.example") }).soft).toBe(false);
    expect(checkForwardedBankMail({ fromEmail: "no-reply@o.sofi.org", dkimResult: undefined, rawHeaders: JSON.stringify([["DKIM-Signature", "d=o.sofi.org; s=x"]]) }).soft).toBe(false);
  });
});
