import { describe, expect, it } from "vitest";
import { advisoryId, blockingAdvisories } from "../scripts/audit-check.mjs";

const report = {
  vulnerabilities: {
    picomatch: { via: [{ url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", severity: "high", title: "ReDoS" }] },
    fdir: { via: ["picomatch"] },
    minimatch: { via: [{ url: "https://github.com/advisories/GHSA-g3hv-75wg-m249", severity: "moderate", title: "DoS" }] },
    other: { via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "critical", title: "Bad" }] },
  },
};
const ids = (list: { id: string }[]) => list.map((b) => b.id).sort();

describe("audit check", () => {
  it("reads the advisory id from its URL", () => {
    expect(advisoryId("https://github.com/advisories/GHSA-fc5q-39xc-vjpf")).toBe("GHSA-FC5Q-39XC-VJPF");
  });

  it("blocks high and critical advisories, never moderate ones", () => {
    expect(ids(blockingAdvisories(report, [], "2026-11-18"))).toEqual(["GHSA-AAAA-BBBB-CCCC", "GHSA-FC5Q-39XC-VJPF"]);
  });

  it("excuses an allowlisted advisory only until its end date", () => {
    const allow = [{ id: "GHSA-FC5Q-39XC-VJPF", until: "2026-12-31" }];
    expect(ids(blockingAdvisories(report, allow, "2026-12-31"))).toEqual(["GHSA-AAAA-BBBB-CCCC"]);
    expect(ids(blockingAdvisories(report, allow, "2027-01-01"))).toEqual(["GHSA-AAAA-BBBB-CCCC", "GHSA-FC5Q-39XC-VJPF"]);
  });
});
