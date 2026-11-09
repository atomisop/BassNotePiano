import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import type { BrowserContext } from "@playwright/test";

/** Throwaway database only: test-session.mjs refuses anything else. */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://yisehakberhanu@127.0.0.1:5433/bnp_rework_verify?schema=public";

export function makeSessionToken(email: string, opts: { onboarded?: boolean } = {}) {
  return execFileSync("node", ["--env-file=.env", "scripts/rework/test-session.mjs", email, ...(opts.onboarded ? ["--onboarded"] : [])], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    encoding: "utf8",
  }).trim();
}

export async function signInAs(context: BrowserContext, baseURL: string, email: string, opts: { onboarded?: boolean } = {}) {
  await context.addCookies([{ name: "next-auth.session-token", value: makeSessionToken(email, opts), url: baseURL }]);
}

export function db() {
  return new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
}

export function uniqueEmail(tag: string) {
  return `rework.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.test`;
}
