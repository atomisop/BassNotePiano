// Validates docs/rework/evidence/<TASK-ID>/evidence.json for every task.
// Exits nonzero on missing/empty files, placeholder values, SHA mismatch or failing tests.
// Usage: node scripts/rework/verify-evidence.mjs [--root docs/rework/evidence] [--task ID]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const root = resolve(opt("--root", "docs/rework/evidence"));
const only = opt("--task", null);
const TASK_ID = /^P[0-3]-[A-Z0-9]+-\d{2}$/;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const STATUSES = ["DONE", "IN_PROGRESS", "BLOCKED"];
const failures = [];
const fail = (t, m) => failures.push(`${t}: ${m}`);

function realImage(dir, rel, t, label) {
  if (typeof rel !== "string" || !rel) return fail(t, `${label}: empty path`);
  const p = join(dir, rel);
  if (!existsSync(p)) return fail(t, `${label}: missing file ${rel}`);
  const buf = readFileSync(p);
  if (buf.length < 1024) return fail(t, `${label}: ${rel} is under 1 KB`);
  if (!buf.subarray(0, 4).equals(PNG)) return fail(t, `${label}: ${rel} is not a PNG`);
}

function gitHas(sha) {
  try { execSync(`git cat-file -e ${sha}^{commit}`, { stdio: "ignore" }); return true; } catch { return false; }
}

if (!existsSync(root)) {
  console.log(`No evidence directory at ${root}; nothing to verify.`);
  process.exit(0);
}
const tasks = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory() && (!only || d === only));
for (const t of tasks) {
  const dir = join(root, t);
  if (!TASK_ID.test(t)) { fail(t, "folder name is not a valid task ID"); continue; }
  const mf = join(dir, "evidence.json");
  if (!existsSync(mf)) { fail(t, "evidence.json missing"); continue; }
  let m;
  try { m = JSON.parse(readFileSync(mf, "utf8")); } catch { fail(t, "evidence.json is not valid JSON"); continue; }
  if (m.taskId !== t) fail(t, `taskId "${m.taskId}" does not match folder`);
  if (!STATUSES.includes(m.status)) fail(t, `status must be one of ${STATUSES.join(", ")}`);
  if (m.status === "BLOCKED") {
    if (!Array.isArray(m.blockingIssues) || m.blockingIssues.length === 0) fail(t, "BLOCKED needs blockingIssues describing the real cause");
    continue;
  }
  if (m.status === "IN_PROGRESS") continue;
  // DONE: everything must be real.
  if (!/^[0-9a-f]{7,40}$/.test(m.commit || "") || !gitHas(m.commit)) fail(t, `commit "${m.commit}" is not a real git commit`);
  if (!Array.isArray(m.viewports) || !m.viewports.includes("1440x900") || !m.viewports.includes("390x844")) fail(t, "viewports must include 1440x900 and 390x844");
  for (const k of ["before", "after", "stateProof"]) {
    if (!Array.isArray(m[k]) || m[k].length === 0) fail(t, `${k} must list at least one screenshot`);
    else m[k].forEach((f) => realImage(dir, f, t, k));
  }
  for (const k of ["testResults", "reviewerNotes"]) {
    const p = join(dir, m[k] || "");
    if (!m[k] || !existsSync(p) || readFileSync(p, "utf8").trim().length < 20) fail(t, `${k} missing or empty`);
  }
  const tp = join(dir, m.testResults || "");
  if (existsSync(tp)) {
    const txt = readFileSync(tp, "utf8");
    if (!/exit(?: status| code)?:?\s*0/i.test(txt)) fail(t, "tests.txt has no 'exit status: 0' line");
    if (/exit(?: status| code)?:?\s*[1-9]/i.test(txt)) fail(t, "tests.txt records a failing exit status");
  }
  if (m.accessibilityResults && !existsSync(join(dir, m.accessibilityResults))) fail(t, "accessibilityResults file missing");
  if (JSON.stringify(m).includes("REPLACE_WITH")) fail(t, "manifest still contains placeholder text");
  if (Array.isArray(m.blockingIssues) && m.blockingIssues.length) fail(t, "DONE but blockingIssues is not empty");
}
if (failures.length) {
  console.error(`rework:verify FAILED (${failures.length})\n` + failures.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log(`rework:verify passed for ${tasks.length} task(s).`);
