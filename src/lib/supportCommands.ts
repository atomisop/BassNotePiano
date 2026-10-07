// Slash commands in Support Chat's reply box. Typing /isaac, /admin or /<any
// admin's name> transfers the case instead of sending a message to the
// customer. Pure helpers so the matching rules are unit tested; the transfer
// itself is transferSupportThread in support.ts.

export interface MentionableAdmin {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9._-]/g, "");

/** What the admin types after the slash: username, else first name, else the start of their email. */
export function adminHandle(admin: MentionableAdmin): string {
  const firstName = admin.name?.trim().split(/\s+/)[0] ?? "";
  return norm(admin.username ?? "") || norm(firstName) || norm(admin.email.split("@")[0]);
}

/** How an admin is named in the app. */
export function adminLabel(admin: MentionableAdmin): string {
  return admin.name?.trim() || (admin.username ? `@${admin.username}` : admin.email.split("@")[0]);
}

/** "/isaac please look at this" gives { token: "isaac", rest: "please look at this" }. Null when the text is not a command. */
export function parseSlashCommand(text: string): { token: string; rest: string } | null {
  const match = text.trimStart().match(/^\/([A-Za-z0-9._-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { token: match[1].toLowerCase(), rest: (match[2] ?? "").trim() };
}

export type AdminMatch =
  | { kind: "all" }
  | { kind: "one"; admin: MentionableAdmin }
  | { kind: "ambiguous"; candidates: MentionableAdmin[] }
  | { kind: "none" };

function keysFor(admin: MentionableAdmin): string[] {
  const parts = (admin.name ?? "").trim().split(/\s+/).filter(Boolean);
  return Array.from(
    new Set(
      [adminHandle(admin), norm(admin.username ?? ""), norm(parts[0] ?? ""), norm(parts.join("")), norm(admin.email.split("@")[0])].filter(
        Boolean,
      ),
    ),
  );
}

/**
 * /admin means every admin. Otherwise the match is tried in tiers, and the
 * first tier with a result decides: 1) the exact handle the picker inserts,
 * 2) an exact username, first name, full name or email name, 3) a unique
 * prefix of one. Inside a tier, two admins matching is never guessed at: the
 * caller asks the sender to be more specific. So a handle chosen from the
 * picker always reaches that admin, even if another admin shares a first name.
 */
export function matchAdminToken(token: string, admins: MentionableAdmin[]): AdminMatch {
  const wanted = norm(token);
  if (!wanted) return { kind: "none" };
  if (wanted === "admin" || wanted === "admins" || wanted === "everyone" || wanted === "all") return { kind: "all" };

  const tiers: MentionableAdmin[][] = [
    admins.filter((a) => adminHandle(a) === wanted),
    admins.filter((a) => keysFor(a).includes(wanted)),
    wanted.length >= 2 ? admins.filter((a) => keysFor(a).some((key) => key.startsWith(wanted))) : [],
  ];
  for (const found of tiers) {
    if (found.length === 1) return { kind: "one", admin: found[0] };
    if (found.length > 1) return { kind: "ambiguous", candidates: found };
  }
  return { kind: "none" };
}
