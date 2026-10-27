import { describe, expect, it } from "vitest";
import { NotificationType } from "@prisma/client";
import { DEFAULT_NOTIFICATION_HREF, notificationTarget, safeInAppHref } from "@/lib/notificationTargets";

describe("notification targets", () => {
  it("every notification type opens somewhere", () => {
    const types = Object.keys(NotificationType);
    expect(types.length).toBeGreaterThan(30);
    for (const type of types) {
      expect(notificationTarget(type), type).toMatch(/^\//);
    }
    expect(Object.keys(DEFAULT_NOTIFICATION_HREF).sort()).toEqual(types.sort());
  });

  it("its own recorded page wins over the type's page", () => {
    expect(notificationTarget("ADMIN_ALERT", "/admin/users/abc")).toBe("/admin/users/abc");
    expect(notificationTarget("ADMIN_ALERT", null)).toBe("/admin");
  });

  it("never follows anything but an in-app path", () => {
    for (const bad of ["https://evil.com", "//evil.com", "javascript:alert(1)", "", "/\\evil.com", null, undefined]) {
      expect(safeInAppHref(bad)).toBeNull();
    }
    expect(notificationTarget("ADMIN_ALERT", "https://evil.com")).toBe("/admin");
  });
});
