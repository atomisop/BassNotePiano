// The CI security gate: `npm audit` on the packages that ship to production, failing on any high or critical advisory, except the
// few listed in audit-allowlist.json. An entry there names one advisory (its GitHub id), why it cannot reach a visitor, and the day
// it lapses; after that day it counts again, so every exception is looked at again. Run with `node scripts/audit-check.mjs`.
// Added 2026-11-18 with the owner's approval, for the picomatch advisory that has no fixed version yet.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);

/** The advisory id at the end of an advisory URL (GHSA-xxxx-xxxx-xxxx), or the URL itself. */
export function advisoryId(url) {
  const m = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(url ?? "");
  return m ? m[0].toUpperCase() : String(url ?? "");
}

/**
 * The blocking advisories in an `npm audit --json` report that the allowlist does not excuse on `today` (YYYY-MM-DD).
 * Each is { id, severity, title, packages }.
 */
export function blockingAdvisories(report, allowlist, today) {
  const excused = new Set(allowlist.filter((e) => e.id && e.until && e.until >= today).map((e) => e.id.toUpperCase()));
  const found = new Map();
  for (const [name, vuln] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
      const id = advisoryId(via.url);
      if (excused.has(id)) continue;
      const entry = found.get(id) ?? { id, severity: via.severity, title: via.title ?? "", packages: [] };
      if (!entry.packages.includes(name)) entry.packages.push(name);
      found.set(id, entry);
    }
  }
  return [...found.values()];
}

function main() {
  let raw;
  try {
    raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // npm audit exits non-zero whenever it finds anything; the report is still on stdout.
    raw = e.stdout;
  }
  const report = JSON.parse(raw);
  if (report.error) throw new Error(`npm audit failed: ${JSON.stringify(report.error)}`);
  const allowlist = JSON.parse(readFileSync(new URL("../audit-allowlist.json", import.meta.url), "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  for (const e of allowlist) {
    if (e.until < today) console.log(`Allowlist entry ${e.id} lapsed on ${e.until}; it counts again.`);
  }
  const blocking = blockingAdvisories(report, allowlist, today);
  if (blocking.length === 0) {
    console.log("No high or critical advisory in production packages outside the allowlist.");
    return;
  }
  for (const b of blocking) console.error(`${b.severity.toUpperCase()} ${b.id} ${b.title} (in ${b.packages.join(", ")})`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
