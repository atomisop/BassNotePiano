import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * P0-SEC-03: a server action is a public endpoint, so every exported function under the admin screens must check who is calling.
 * A function passes when its own body contains a guard, or when it calls a local (non-exported) wrapper whose body does.
 * A new admin action with no guard fails here before it can ship.
 */
const GUARD = /(requireAdmin|requireOwner|assertAdmin|requireStaff|requireAdminSession|requireAdminUser|getAdminSession|assertOwner|requireTeacher|requirePermission|role\s*!==\s*"ADMIN"|role\s*===\s*"ADMIN"|isOwnerEmail)/;

function files(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, match, out);
    else if (match(p)) out.push(p);
  }
  return out;
}

function bodies(source: string) {
  const parts = source.split(/\n(?=(?:export )?(?:async )?function \w+)/);
  const wrappers = new Set<string>();
  const exported: { name: string; body: string }[] = [];
  for (const part of parts) {
    const m = part.match(/^(export )?(?:async )?function (\w+)/);
    if (!m) continue;
    if (m[1]) exported.push({ name: m[2], body: part });
    else if (GUARD.test(part)) wrappers.add(m[2]);
  }
  return { wrappers, exported };
}

describe("admin server actions are all guarded", () => {
  const targets = [
    ...files("src/app/(dashboard)/admin", (f) => /actions?\.ts$/.test(f) || /Actions\.ts$/.test(f)),
    ...files("src/app/api/admin", (f) => f.endsWith("route.ts")),
  ];

  it("finds the admin action files", () => {
    expect(targets.length).toBeGreaterThan(15);
  });

  for (const file of targets) {
    it(`${file}`, () => {
      const source = readFileSync(file, "utf8");
      if (/^\s*["']use server["']/m.test(source) === false && !file.endsWith("route.ts")) return;
      const { wrappers, exported } = bodies(source);
      const unguarded = exported.filter(({ body }) => !GUARD.test(body) && ![...wrappers].some((w) => new RegExp(`\\b${w}\\(`).test(body))).map((e) => e.name);
      // A route.ts file's handlers are named GET/POST/...; the same rule applies to them.
      expect(unguarded).toEqual([]);
    });
  }
});
