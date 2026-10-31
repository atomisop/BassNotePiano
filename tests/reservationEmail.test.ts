import { describe, expect, it } from "vitest";
import { joinTimes, reservationEmailBody } from "@/lib/reservationEmail";
import { reservationIsFor } from "@/lib/ownerReservations";

describe("reservationEmailBody", () => {
  const base = { name: "Nake Bekele", when: "Saturday, Nov 7 at 10:00 AM", email: "nake@example.com" };
  it("greets by first name, names the day and time, and tells them to start a subscription to claim it", () => {
    const body = reservationEmailBody({ ...base, hasAccount: true });
    expect(body).toContain("Hey Nake,");
    expect(body).toContain("The owner reserved a time for you: Saturday, Nov 7 at 10:00 AM.");
    expect(body).toContain("Start your subscription to claim your reservation.");
  });
  it("tells someone with an account to sign in with that address, and someone without one to make an account with it", () => {
    expect(reservationEmailBody({ ...base, hasAccount: true })).toContain("Sign in with this email address (nake@example.com)");
    expect(reservationEmailBody({ ...base, hasAccount: false })).toContain("Make your account with this email address (nake@example.com)");
  });
  it("does not break on an odd name", () => {
    expect(reservationEmailBody({ ...base, name: "  ", hasAccount: true })).toContain("Hey there,");
  });
});

describe("joinTimes", () => {
  it("reads naturally for one, two and three times", () => {
    expect(joinTimes(["10:00 AM"])).toBe("10:00 AM");
    expect(joinTimes(["10:00 AM", "11:00 AM"])).toBe("10:00 AM and 11:00 AM");
    expect(joinTimes(["10:00 AM", "11:00 AM", "12:00 PM"])).toBe("10:00 AM, 11:00 AM and 12:00 PM");
  });
});

describe("reservationIsFor", () => {
  const verified = new Date();
  it("matches a verified account with the same email, ignoring capitals and spaces", () => {
    expect(reservationIsFor("pat@example.com", { email: "Pat@Example.com", emailVerified: verified })).toBe(true);
    expect(reservationIsFor(" pat@example.com ", { email: "pat@example.com", emailVerified: verified })).toBe(true);
  });
  it("never matches an unverified account, a different email, or nobody", () => {
    expect(reservationIsFor("pat@example.com", { email: "pat@example.com", emailVerified: null })).toBe(false);
    expect(reservationIsFor("pat@example.com", { email: "other@example.com", emailVerified: verified })).toBe(false);
    expect(reservationIsFor("pat@example.com", null)).toBe(false);
  });
  it("does not fold Gmail dots or plus tags: only the exact address is the right customer", () => {
    expect(reservationIsFor("pat@gmail.com", { email: "p.at@gmail.com", emailVerified: verified })).toBe(false);
    expect(reservationIsFor("pat@gmail.com", { email: "pat+x@gmail.com", emailVerified: verified })).toBe(false);
  });
});
