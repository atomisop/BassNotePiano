import { describe, expect, it } from "vitest";
import { buildNeedsYou, isNeedsYouKind, needsYouRowSpec } from "@/lib/needsYou";

const item = (id: string, count: number, href = "/admin", label = "") => ({ id, count, href, label });

describe("buildNeedsYou", () => {
  it("lists only what is waiting, money first", () => {
    const rows = buildNeedsYou([item("support", 1), item("payments", 2), item("unmarked", 0)], [{ key: "overdue", total: 3, href: "/admin/payment-plans" }]);
    expect(rows.map((r) => r.text)).toEqual(["2 payments to approve", "3 bills overdue", "1 chat waiting for a reply"]);
  });

  it("sends overdue bills to the overdue plans, not the whole list", () => {
    const [row] = buildNeedsYou([], [{ key: "overdue", total: 2, href: "/admin/payment-plans" }]);
    expect(row.href).toBe("/admin/payment-plans?status=OVERDUE");
  });

  it("keeps booking requests apart from classes to mark, each with its own page", () => {
    const rows = buildNeedsYou([item("unmarked", 4), item("requests", 2)], []);
    expect(rows.map((r) => [r.id, r.href, r.text])).toEqual([
      ["requests", "/admin/schedule?view=REQUESTS", "2 booking requests to answer"],
      ["unmarked", "/admin/today", "4 classes to mark present or no-show"],
    ]);
  });

  it("shows what the alerts button knows: ready scales, stopped tasks, payments to check, unmatched emails", () => {
    const rows = buildNeedsYou([item("scales", 1), item("jobs", 2), item("unchecked", 1), item("unmatched", 3)], []);
    expect(rows.map((r) => r.text)).toEqual([
      "1 automatic approval to check",
      "3 bank emails matched no one",
      "2 automatic tasks stopped",
      "1 student ready for the next scale",
    ]);
  });

  it("opens in place only where there are items with an action or a page each", () => {
    const rows = buildNeedsYou([item("payments", 1), item("jobs", 1), item("scales", 1)], []);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.expandable]))).toEqual({ payments: true, jobs: false, scales: true });
  });

  it("keeps the assistant's own link (its billing page) and words", () => {
    const [row] = buildNeedsYou([item("atom", 1, "https://example.com/billing", "The assistant is down: check Gemini credits")], []);
    expect(row).toMatchObject({ href: "https://example.com/billing", text: "The assistant is down: check Gemini credits" });
  });

  it("is empty when nothing is waiting", () => {
    expect(buildNeedsYou([], [])).toEqual([]);
  });

  it("uses the singular for one", () => {
    expect(buildNeedsYou([item("applicants", 1)], [])[0].text).toBe("1 applicant to answer");
    expect(buildNeedsYou([item("jobs", 1)], [])[0].text).toBe("An automatic task stopped");
  });

  it("knows its own kinds and nothing else", () => {
    expect(isNeedsYouKind("payments")).toBe(true);
    expect(isNeedsYouKind("drop table")).toBe(false);
    expect(needsYouRowSpec("unmarked")?.expandable).toBe(true);
  });
});
