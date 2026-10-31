import { describe, expect, it } from "vitest";
import { JOB_MAX_SILENCE_HOURS } from "@/lib/jobRun";
import { JOB_NEEDS, jobVerdict } from "@/lib/jobCheckRules";

describe("the live check on the automatic tasks", () => {
  it("knows what every watched task needs, and nothing else", () => {
    expect(Object.keys(JOB_NEEDS).sort()).toEqual(Object.keys(JOB_MAX_SILENCE_HOURS).sort());
  });

  it("is working only when everything the task needs answered", () => {
    expect(jobVerdict("db-backup", { database: { ok: true, detail: null }, storage: { ok: true, detail: "fine" } })).toEqual({
      ok: true,
      summary: "Database, Backup storage working",
      problems: [],
    });
  });

  it("names the broken piece, and counts one that was not checked as broken", () => {
    const v = jobVerdict("discord-class-channels", { database: { ok: true, detail: null }, discord: { ok: false, detail: "Discord refused the bot token." } });
    expect(v.ok).toBe(false);
    expect(v.summary).toBe("Discord: Discord refused the bot token.");
    expect(jobVerdict("job-catch-up", {}).problems).toEqual(["Database: not checked."]);
  });
});
