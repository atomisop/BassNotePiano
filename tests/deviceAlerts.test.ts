import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email", () => ({ sendNewDeviceEmail: vi.fn() }));

import { deviceKind, placeFromHeaders, placeLabel } from "@/lib/deviceAlerts";

describe("placeFromHeaders", () => {
  it("reads Netlify's base64 geo header", () => {
    const geo = Buffer.from(JSON.stringify({ city: "Brooklyn", country: { code: "US", name: "United States" }, subdivision: { code: "NY", name: "New York" } })).toString("base64");
    const place = placeFromHeaders(new Headers({ "x-nf-geo": geo }));
    expect(placeLabel(place)).toBe("Brooklyn, New York, United States");
  });

  it("reads plain header objects (the sign-in request) and URL-encoded city names", () => {
    const place = placeFromHeaders({ "x-vercel-ip-city": "S%C3%A3o%20Paulo", "x-vercel-ip-country": "BR" });
    expect(placeLabel(place)).toBe("São Paulo, BR");
  });

  it("returns nothing when the host sends no location, and never reads an IP", () => {
    expect(placeLabel(placeFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" })))).toBeNull();
    expect(placeLabel(placeFromHeaders(undefined))).toBeNull();
  });
});

describe("deviceKind", () => {
  it("tells phones, tablets and computers apart from the label", () => {
    expect(deviceKind("Safari on iPhone")).toBe("Phone");
    expect(deviceKind("Chrome on Android")).toBe("Phone");
    expect(deviceKind("Safari on iPad")).toBe("Tablet");
    expect(deviceKind("Chrome on Mac")).toBe("Computer");
  });
});
