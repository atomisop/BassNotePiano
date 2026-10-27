import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Next.js stops the build ("Only async functions are allowed to be exported in a 'use server' file") when a file that starts
// with "use server" exports a constant, a class, a plain function or a value re-export. The type check and lint do not see it,
// so it only showed up in CI. This reads every such file the way the build would, so `npm test` and the pre-push check catch it.

const DIRECTIVE = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use server["']/;

/** The exports of a "use server" file that Next.js would refuse (an empty list when the file is not one, or is fine). */
export function badServerExports(source: string): string[] {
  if (!DIRECTIVE.test(source)) return [];
  const bad: string[] = [];
  for (const line of source.split("\n")) {
    if (/^export\s+(?:const|let|var)\s+\w+[^=\n]*=\s*(?!async\b)(?=\S)/.test(line)) bad.push(line.trim());
    else if (/^export\s+(?:function|class|enum|abstract\s+class)\b/.test(line)) bad.push(line.trim());
    else if (/^export\s+(?:\{|\*)/.test(line)) bad.push(line.trim());
    else if (/^export\s+default\s+(?!async\b)/.test(line)) bad.push(line.trim());
  }
  return bad;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("badServerExports", () => {
  it("flags the exports Next.js refuses in a use server file", () => {
    const file = (body: string) => `"use server";\n\nimport x from "y";\n${body}\n`;
    expect(badServerExports(file('export const PRECHECK_PREFIX = "Screenshot";'))).toHaveLength(1);
    expect(badServerExports(file("export function plain() {}"))).toHaveLength(1);
    expect(badServerExports(file("export class A {}"))).toHaveLength(1);
    expect(badServerExports(file("export enum E { A }"))).toHaveLength(1);
    expect(badServerExports(file('export { a } from "./a";'))).toHaveLength(1);
    expect(badServerExports(file("export default function () {}"))).toHaveLength(1);
  });

  it("allows async functions and types", () => {
    const file = `"use server";\nexport async function save() {}\nexport const go = async () => {};\nexport type T = string;\nexport interface I {}\nexport default async function main() {}\nconst PRIVATE = 1;\n`;
    expect(badServerExports(file)).toEqual([]);
  });

  it("ignores a file that is not a use server file, and sees the directive after a comment", () => {
    expect(badServerExports('export const A = 1;\n')).toEqual([]);
    expect(badServerExports('// actions\n"use server";\nexport const A = 1;\n')).toHaveLength(1);
  });
});

describe("every use server file in the app", () => {
  it("exports only async functions and types", () => {
    const problems: string[] = [];
    for (const file of sourceFiles("src")) {
      const bad = badServerExports(readFileSync(file, "utf8"));
      for (const line of bad) problems.push(`${file}: ${line}`);
    }
    expect(problems).toEqual([]);
  });
});
