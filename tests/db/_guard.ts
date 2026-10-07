// These tests write and delete real rows. Refuse to run against anything but a database on this machine.
const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  throw new Error(`Refusing to run database tests: DATABASE_URL points at "${host || "nothing"}", not a local database.`);
}
process.env.RESEND_API_KEY = "";
