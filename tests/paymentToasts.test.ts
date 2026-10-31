import { describe, expect, it } from "vitest";
import { newPaymentToasts, toastForNotice } from "@/lib/paymentToasts";

const notice = (id: string, type: string, title = "T", body: string | null = "Body") => ({ id, type, title, body });

describe("toastForNotice", () => {
  it("maps each payment notice to its kind and reuses the server's words", () => {
    expect(toastForNotice(notice("1", "PAYMENT_RECEIVED", "Payment received", "Thanks"))).toEqual({ kind: "success", title: "Payment received", description: "Thanks" });
    expect(toastForNotice(notice("2", "PAYMENT_REJECTED"))?.kind).toBe("error");
    expect(toastForNotice(notice("3", "PAYMENT_AMOUNT_MISMATCH"))?.kind).toBe("warning");
    expect(toastForNotice(notice("4", "PAYMENT_PLAN_UPDATED"))?.kind).toBe("info");
  });

  it("ignores notices that are not about a payment", () => {
    expect(toastForNotice(notice("5", "FRIEND_REQUEST"))).toBeNull();
    expect(toastForNotice(notice("6", "PAYMENT_SUBMITTED"))).toBeNull(); // an admin notice, not for students
  });

  it("shortens a long body and drops an empty one", () => {
    const long = toastForNotice(notice("7", "PAYMENT_RECEIVED", "T", "x".repeat(400)));
    expect(long?.description?.length).toBeLessThanOrEqual(140);
    expect(long?.description?.endsWith("…")).toBe(true);
    expect(toastForNotice(notice("8", "PAYMENT_RECEIVED", "T", "  "))?.description).toBeUndefined();
  });
});

describe("newPaymentToasts", () => {
  it("shows nothing on the first poll, only remembers what was there", () => {
    const first = newPaymentToasts([notice("a", "PAYMENT_RECEIVED")], null);
    expect(first.toasts).toEqual([]);
    expect([...first.seen]).toEqual(["a"]);
  });

  it("toasts only notices it has not seen, oldest first, and never twice", () => {
    const seen = new Set(["a"]);
    const next = newPaymentToasts([notice("c", "PAYMENT_REJECTED", "Newest"), notice("b", "PAYMENT_RECEIVED", "Older"), notice("a", "PAYMENT_RECEIVED")], seen);
    expect(next.toasts.map((t) => t.title)).toEqual(["Older", "Newest"]);
    expect(newPaymentToasts([notice("c", "PAYMENT_REJECTED"), notice("b", "PAYMENT_RECEIVED")], next.seen).toasts).toEqual([]);
  });

  it("remembers non-payment notices too, so they never toast later", () => {
    const next = newPaymentToasts([notice("z", "FRIEND_REQUEST")], new Set());
    expect(next.toasts).toEqual([]);
    expect(next.seen.has("z")).toBe(true);
  });
});
