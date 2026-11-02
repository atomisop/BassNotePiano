/**
 * "Did you mean gmail.com?"
 *
 * A live student typed their address as gnail.com and the studio's first email to them bounced, with nobody told
 * (2026-11-02 audit). This looks at the part after the @ and suggests the well-known provider it is one slip away from.
 * It only ever suggests; the person decides. Pure, so it is tested.
 */

const PROVIDERS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "live.com", "msn.com"];

/** Real providers one letter away from one above, which must never be "corrected". */
const REAL_NEIGHBOURS = ["mail.com", "ymail.com", "me.com", "mac.com", "pm.me", "proton.me", "hey.com"];

/** Spellings seen in the wild that a distance check alone would miss or mis-assign. */
const KNOWN_SLIPS: Record<string, string> = {
  "googlemail.com": "",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmall.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "yahoo.co": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

/** Edit distance where swapping two neighbouring letters ("gmali") counts as one slip, like a typo does. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The full address with the provider corrected, or null when the address looks fine or is not close to a known provider. */
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain.includes(".") || /\s/.test(domain)) return null;
  if (PROVIDERS.includes(domain) || REAL_NEIGHBOURS.includes(domain)) return null;
  if (domain in KNOWN_SLIPS) return KNOWN_SLIPS[domain] ? `${local}@${KNOWN_SLIPS[domain]}` : null;
  // Exactly one slip from exactly one well-known provider (a real provider that is itself one letter away is listed above).
  const close = PROVIDERS.filter((p) => distance(domain, p) === 1);
  return close.length === 1 ? `${local}@${close[0]}` : null;
}
