import { afterAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// scripts/release-to-production.sh decides what goes live. It must only ever move `release` forward, only to a main commit whose CI
// passed, and never touch anything when there is nothing new or when `release` holds commits main does not. Run here against real
// throwaway Git repositories, with a stand-in for the `gh` program that answers like GitHub would.

const SCRIPT = resolve(__dirname, "../scripts/release-to-production.sh");
const made: string[] = [];
afterAll(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const GIT_ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A bare "GitHub" with a main branch holding one commit, a working copy of it, and a fake gh that logs every call. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "bnp-release-"));
  made.push(root);
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  const bin = join(root, "bin");
  const log = join(root, "gh.log");
  mkdirSync(bin);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, work], { stdio: "ignore" });
  writeFileSync(join(work, "a.txt"), "one\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "first");
  git(work, "push", "-q", "origin", "HEAD:main");
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
echo "$@" >> "${log}"
case "$1 $2" in
  "run list") [ -n "\${STUB_RUN_LIST:-}" ] && echo "$STUB_RUN_LIST"; true ;;
  "run watch") exit "\${STUB_WATCH_EXIT:-0}" ;;
  "run view") echo "\${STUB_CONCLUSION:-success}" ;;
esac
`,
  );
  chmodSync(join(bin, "gh"), 0o755);

  const commit = (name: string) => {
    writeFileSync(join(work, `${name}.txt`), `${name}\n`);
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", name);
    git(work, "push", "-q", "origin", "HEAD:main");
    return git(work, "rev-parse", "HEAD");
  };
  const remote = (ref: string) => {
    try {
      return git(origin, "rev-parse", "--verify", "-q", ref);
    } catch {
      return null;
    }
  };
  const run = (env: Record<string, string> = {}) => {
    const r = spawnSync("bash", [SCRIPT], {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, RELEASE_CI_WAIT_TRIES: "2", RELEASE_CI_WAIT_SECONDS: "0", STUB_RUN_LIST: "1 completed", ...env },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const ghCalls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
  return { work, origin, commit, remote, run, ghCalls };
}

describe("release-to-production.sh", () => {
  it("creates the release branch from main on the first run, when CI passed", () => {
    const s = setup();
    const main = s.remote("main");
    const r = s.run();
    expect(r.status).toBe(0);
    expect(s.remote("release")).toBe(main);
  });

  it("moves a release that is behind forward to the newest main commit", () => {
    const s = setup();
    expect(s.run().status).toBe(0);
    const next = s.commit("second");
    const r = s.run();
    expect(r.status).toBe(0);
    expect(s.remote("release")).toBe(next);
    expect(r.out).toContain("second");
  });

  it("does nothing, and does not even ask GitHub, when nothing new landed on main", () => {
    const s = setup();
    expect(s.run().status).toBe(0);
    const before = s.remote("release");
    const calls = s.ghCalls();
    const r = s.run();
    expect(r.status).toBe(0);
    expect(r.out).toContain("Nothing new");
    expect(s.remote("release")).toBe(before);
    expect(s.ghCalls()).toBe(calls);
  });

  it("releases nothing when CI failed on the newest main commit", () => {
    const s = setup();
    expect(s.run().status).toBe(0);
    const live = s.remote("release");
    s.commit("broken");
    const r = s.run({ STUB_CONCLUSION: "failure" });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("CI did not pass");
    expect(s.remote("release")).toBe(live);
  });

  it("releases nothing when CI has not even started for that commit", () => {
    const s = setup();
    const r = s.run({ STUB_RUN_LIST: "" });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("CI has not started");
    expect(s.remote("release")).toBeNull();
  });

  it("waits for a CI run that is still going, then releases when it passes", () => {
    const s = setup();
    const main = s.remote("main");
    const r = s.run({ STUB_RUN_LIST: "42 in_progress", STUB_WATCH_EXIT: "0", STUB_CONCLUSION: "success" });
    expect(r.status).toBe(0);
    expect(s.ghCalls()).toContain("run watch 42");
    expect(s.remote("release")).toBe(main);
  });

  it("does not release when the CI run that was still going ends red", () => {
    const s = setup();
    const r = s.run({ STUB_RUN_LIST: "42 in_progress", STUB_WATCH_EXIT: "1", STUB_CONCLUSION: "failure" });
    expect(r.status).not.toBe(0);
    expect(s.remote("release")).toBeNull();
  });

  it("refuses, and changes nothing, when release holds a commit that main does not", () => {
    const s = setup();
    expect(s.run().status).toBe(0);
    // Someone commits straight onto release: it is no longer an ancestor of main.
    git(s.work, "checkout", "-q", "-b", "side", "origin/release");
    writeFileSync(join(s.work, "hotfix.txt"), "x\n");
    git(s.work, "add", "-A");
    git(s.work, "commit", "-q", "-m", "hotfix on release");
    git(s.work, "push", "-q", "origin", "HEAD:release");
    const diverged = s.remote("release");
    git(s.work, "checkout", "-q", "main");
    s.commit("third");
    const r = s.run();
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("cannot be moved forward");
    expect(s.remote("release")).toBe(diverged);
  });
});
