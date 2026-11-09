import { describe, expect, it } from "vitest";
import { answerHref, answerIdFrom, answerKindFor, answeredLabel, parentMoveHref } from "@/lib/bellAnswers";
import { safeInAppHref } from "@/lib/notificationTargets";

describe("requests answered on the bell entry", () => {
  it("puts the request id before the page part, keeping a query the page already has", () => {
    expect(answerHref("/friends#requests", "ckabcdefghij")).toBe("/friends?answer=ckabcdefghij#requests");
    expect(answerHref("/account?tab=account#parent-mode", "ckabcdefghij")).toBe("/account?tab=account&answer=ckabcdefghij#parent-mode");
    expect(answerHref("/billing/plans", "ckabcdefghij")).toBe("/billing/plans?answer=ckabcdefghij");
  });

  it("reads the id back, and only something shaped like an id", () => {
    for (const base of ["/friends#requests", "/account?tab=account#parent-mode", "/billing/plans"]) {
      expect(answerIdFrom(answerHref(base, "clx9z8y7w6v5u4"))).toBe("clx9z8y7w6v5u4");
    }
    expect(answerIdFrom("/friends#requests")).toBeNull();
    expect(answerIdFrom(null)).toBeNull();
    expect(answerIdFrom("/friends?answer=../../admin")).toBeNull();
    expect(answerIdFrom("/friends?answer=short")).toBeNull();
  });

  it("knows which notices carry a request", () => {
    expect(answerKindFor("FRIEND_REQUEST_RECEIVED")).toBe("friend");
    expect(answerKindFor("PARENT_LINK_REQUEST")).toBe("parent");
    expect(answerKindFor("GROUP_INVITE")).toBe("group");
    expect(answerKindFor("PAYMENT_APPROVED")).toBeNull();
  });

  it("the links stay in-app links the bell follows", () => {
    expect(safeInAppHref(answerHref("/friends#requests", "ckabcdefghij"))).not.toBeNull();
    expect(safeInAppHref(parentMoveHref("ckchild12345", "ckbooking1234"))).toBe("/parent/ckchild12345?move=ckbooking1234");
  });

  it("says what happened to an answered request", () => {
    expect(answeredLabel("PENDING")).toBeNull();
    expect(answeredLabel("ACCEPTED")).toBe("Accepted");
    expect(answeredLabel("DECLINED")).toBe("Declined");
    expect(answeredLabel("GONE")).toBe("No longer waiting");
  });
});
