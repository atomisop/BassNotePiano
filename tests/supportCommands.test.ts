import { describe, expect, it } from "vitest";
import { adminHandle, adminLabel, matchAdminToken, parseSlashCommand, type MentionableAdmin } from "@/lib/supportCommands";

const isaac: MentionableAdmin = { id: "1", name: "Isaac Berhanu", username: "isaac", email: "isaacberhanu777@gmail.com" };
const eliza: MentionableAdmin = { id: "2", name: "Eliza Tesfaye", username: null, email: "eliza@example.com" };
const lulit: MentionableAdmin = { id: "3", name: "Lulit K", username: "lulit", email: "lulit@example.com" };
const isaacTwo: MentionableAdmin = { id: "4", name: "Isaac Kebede", username: "ikebede", email: "ik@example.com" };

describe("parseSlashCommand", () => {
  it("splits the command from the note", () => {
    expect(parseSlashCommand("/isaac please look at this")).toEqual({ token: "isaac", rest: "please look at this" });
    expect(parseSlashCommand("  /Admin  ")).toEqual({ token: "admin", rest: "" });
    expect(parseSlashCommand("/eliza\nsecond line")).toEqual({ token: "eliza", rest: "second line" });
  });
  it("treats everything else as a normal message", () => {
    expect(parseSlashCommand("Hello there")).toBeNull();
    expect(parseSlashCommand("/ hello")).toBeNull();
    expect(parseSlashCommand("see /isaac later")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
  });
});

describe("handles and labels", () => {
  it("prefers username, then first name, then the email name", () => {
    expect(adminHandle(isaac)).toBe("isaac");
    expect(adminHandle(eliza)).toBe("eliza");
    expect(adminHandle({ id: "9", name: null, username: null, email: "Pat.Q@example.com" })).toBe("pat.q");
  });
  it("labels by name, then @username, then the email name", () => {
    expect(adminLabel(isaac)).toBe("Isaac Berhanu");
    expect(adminLabel({ id: "9", name: null, username: "pat", email: "p@x.com" })).toBe("@pat");
    expect(adminLabel({ id: "9", name: null, username: null, email: "pat@x.com" })).toBe("pat");
  });
});

describe("matchAdminToken", () => {
  const admins = [isaac, eliza, lulit];
  it("/admin and friends mean everyone", () => {
    for (const word of ["admin", "admins", "everyone", "all"]) expect(matchAdminToken(word, admins)).toEqual({ kind: "all" });
  });
  it("matches by username, first name and the start of the email", () => {
    expect(matchAdminToken("isaac", admins)).toEqual({ kind: "one", admin: isaac });
    expect(matchAdminToken("eliza", admins)).toEqual({ kind: "one", admin: eliza });
    expect(matchAdminToken("lul", admins)).toEqual({ kind: "one", admin: lulit });
    expect(matchAdminToken("isaacberhanu777", admins)).toEqual({ kind: "one", admin: isaac });
  });
  it("asks for more when two admins match instead of guessing", () => {
    const noUsernameA: MentionableAdmin = { id: "5", name: "Isaac Alem", username: null, email: "ia@example.com" };
    const noUsernameB: MentionableAdmin = { id: "6", name: "Isaac Bekele", username: null, email: "ib@example.com" };
    expect(matchAdminToken("isaac", [noUsernameA, noUsernameB]).kind).toBe("ambiguous");
    expect(matchAdminToken("is", [isaac, isaacTwo]).kind).toBe("ambiguous");
  });
  it("lets the handle the picker inserts win over another admin's first name", () => {
    // isaacTwo is also called Isaac, but /isaac is Isaac Berhanu's own handle.
    expect(matchAdminToken("isaac", [isaac, isaacTwo])).toEqual({ kind: "one", admin: isaac });
    expect(matchAdminToken("ikebede", [isaac, isaacTwo])).toEqual({ kind: "one", admin: isaacTwo });
  });
  it("finds nothing for an unknown name or a one-letter prefix", () => {
    expect(matchAdminToken("zed", admins)).toEqual({ kind: "none" });
    expect(matchAdminToken("e", admins)).toEqual({ kind: "none" });
    expect(matchAdminToken("", admins)).toEqual({ kind: "none" });
  });
});
