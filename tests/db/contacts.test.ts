import { afterAll, describe, expect, it } from "vitest";
import { addHold, addSession, ContactError, createContact, deleteContact, getActiveHolds, getContact, listContacts, releaseHold, updateContact } from "@/lib/contacts";
import { newTag, prisma } from "./helpers";

const tag = newTag("ct");
const scheduleIds: string[] = [];
const contactIds: string[] = [];

afterAll(async () => {
  await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
});

async function schedule(durationMin = 120) {
  const row = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "16:00", durationMin, creditCost: durationMin / 30, label: tag } });
  scheduleIds.push(row.id);
  return row;
}
async function contact(name: string) {
  const row = await createContact({ name: `${tag} ${name}` });
  contactIds.push(row.id);
  return row;
}
const dayFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("contacts", () => {
  it("saves a person with only a name and refuses a bad email, status or name", async () => {
    const c = await contact("Mr X");
    expect(c.status).toBe("INTERESTED");
    await expect(createContact({ name: "  " })).rejects.toBeInstanceOf(ContactError);
    await expect(createContact({ name: "A", email: "not-an-email" })).rejects.toBeInstanceOf(ContactError);
    await expect(createContact({ name: "A", status: "VIP" })).rejects.toBeInstanceOf(ContactError);
    await expect(createContact({ name: "A", instrument: "KAZOO" })).rejects.toBeInstanceOf(ContactError);
  });

  it("updates details and finds people by search", async () => {
    const c = await contact("Searchable");
    await updateContact(c.id, { name: `${tag} Searchable`, phone: "+12125550123", email: "S@Example.com", instrument: "GUITAR", skillLevel: "BEGINNER", status: "TRIAL" });
    const found = await listContacts(`${tag} Searchable`);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ email: "s@example.com", status: "TRIAL", instrument: "GUITAR" });
  });

  it("logs the days a person took a class, newest first, and refuses a made-up date", async () => {
    const c = await contact("Student");
    await addSession(c.id, "2026-10-05", true, null);
    await addSession(c.id, "2026-10-12", false, "sick");
    await expect(addSession(c.id, "2026-13-40", true, null)).rejects.toBeInstanceOf(ContactError);
    const full = await getContact(c.id);
    expect(full!.sessions.map((s) => s.date.toISOString().slice(0, 10))).toEqual(["2026-10-12", "2026-10-05"]);
    const row = (await listContacts(`${tag} Student`))[0];
    expect(row.sessionCount).toBe(2);
  });
});

describe("holds", () => {
  it("reserves one hour of a weekly window and reports it with the contact's name", async () => {
    const s = await schedule();
    const c = await contact("Holder");
    await addHold(c.id, s.id, 1, null, "usual time");
    const holds = (await getActiveHolds()).filter((h) => h.scheduleId === s.id);
    expect(holds).toEqual([expect.objectContaining({ contactName: `${tag} Holder`, chunkIndex: 1, untilMs: null })]);
  });

  it("refuses an hour that is not in the window, an inactive window and a past last date", async () => {
    const s = await schedule(60);
    const c = await contact("Picky");
    await expect(addHold(c.id, s.id, 3, null, null)).rejects.toBeInstanceOf(ContactError);
    await expect(addHold(c.id, "missing", 0, null, null)).rejects.toBeInstanceOf(ContactError);
    await expect(addHold(c.id, s.id, 0, "2020-01-01", null)).rejects.toBeInstanceOf(ContactError);
    await prisma.classSchedule.update({ where: { id: s.id }, data: { active: false } });
    await expect(addHold(c.id, s.id, 0, null, null)).rejects.toBeInstanceOf(ContactError);
  });

  it("stops reporting a hold once it is released or its last date passes, and keeps it as history", async () => {
    const s = await schedule();
    const c = await contact("Temp");
    const keep = await addHold(c.id, s.id, 0, dayFromNow(7), null);
    const drop = await addHold(c.id, s.id, 1, null, null);
    expect((await getActiveHolds()).filter((h) => h.scheduleId === s.id)).toHaveLength(2);
    await releaseHold(drop.id);
    expect((await getActiveHolds()).filter((h) => h.scheduleId === s.id).map((h) => h.holdId)).toEqual([keep.id]);
    await prisma.slotHold.update({ where: { id: keep.id }, data: { until: new Date(Date.now() - 3 * 86_400_000) } });
    expect((await getActiveHolds()).filter((h) => h.scheduleId === s.id)).toHaveLength(0);
    expect((await getContact(c.id))!.holds).toHaveLength(2);
  });

  it("never blocks a booking: a held hour is still an ordinary open hour in the schedule tables", async () => {
    const s = await schedule();
    const c = await contact("Soft");
    await addHold(c.id, s.id, 0, null, null);
    expect(await prisma.classBooking.count({ where: { scheduleId: s.id } })).toBe(0);
    expect((await prisma.classSchedule.findUnique({ where: { id: s.id } }))!.active).toBe(true);
  });

  it("deleting a person removes their holds and class log", async () => {
    const s = await schedule();
    const c = await contact("Gone");
    await addHold(c.id, s.id, 0, null, null);
    await addSession(c.id, "2026-10-05", true, null);
    await deleteContact(c.id);
    expect(await prisma.slotHold.count({ where: { contactId: c.id } })).toBe(0);
    expect(await prisma.contactSession.count({ where: { contactId: c.id } })).toBe(0);
  });
});

describe("the combined list of everyone", () => {
  it("shows accounts with their classes and reserved time, applications without an account, and people added by hand", async () => {
    const { listDirectory } = await import("@/lib/contacts");
    const s = await schedule(120);
    const accountUser = await prisma.user.create({ data: { email: `${tag}-acct@example.com`, name: `${tag} Account`, passwordHash: "x" } });
    const appliedOnly = await prisma.classRegistration.create({ data: { fullName: `${tag} Applied`, email: `${tag}-applied@example.com`, phone: "+12125550111", instrument: "BASS", skillLevel: "BEGINNER" } });
    const appliedWithAccount = await prisma.classRegistration.create({ data: { fullName: `${tag} Account`, email: `${tag}-acct@example.com`, phone: "+12125550112", instrument: "GUITAR", skillLevel: "BEGINNER" } });
    const plan = await prisma.paymentPlan.create({
      data: { userId: accountUser.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 1000, creditsPerInstallment: 4, termMonths: 1, nextDueDate: new Date(), reservedScheduleId: s.id, reservedChunkIndex: 1 },
    });
    await prisma.classBooking.create({
      data: { studentId: accountUser.id, scheduleId: s.id, occurrenceDate: new Date(Date.UTC(2026, 9, 5)), scheduledAt: new Date(Date.UTC(2026, 9, 5, 21)), creditsSpent: 2, status: "COMPLETED", attendance: "PRESENT" },
    });
    const added = await contact("Handwritten");
    const all = (await listDirectory(tag)).filter((r) => r.name.startsWith(tag));
    const account = all.find((r) => r.kind === "ACCOUNT")!;
    expect(account).toMatchObject({ classesTaken: 1, href: `/admin/users/${accountUser.id}` });
    expect(account.reserved).toContain("Monday");
    expect(all.filter((r) => r.kind === "APPLICATION").map((r) => r.name)).toEqual([`${tag} Applied`]);
    // The class form row carries what they typed, so the teacher can reach them outside the app.
    expect(all.find((r) => r.kind === "APPLICATION")).toMatchObject({ phone: "+12125550111", detail: "BASS", form: { id: appliedOnly.id, skillLevel: "BEGINNER" } });
    expect(all.find((r) => r.kind === "ADDED")!.href).toBe(`/admin/contacts/${added.id}`);
    expect((await listDirectory(tag, "ACCOUNT")).every((r) => r.kind === "ACCOUNT")).toBe(true);
    await prisma.classBooking.deleteMany({ where: { studentId: accountUser.id } });
    await prisma.paymentPlan.delete({ where: { id: plan.id } });
    await prisma.classRegistration.deleteMany({ where: { id: { in: [appliedOnly.id, appliedWithAccount.id] } } });
    await prisma.user.delete({ where: { id: accountUser.id } });
  });

  it("lists someone who sent the class form twice once, newest first, and removing it takes it off the list", async () => {
    const { listDirectory } = await import("@/lib/contacts");
    const { removeClassRegistration } = await import("@/lib/classRegistration");
    const admin = await prisma.user.create({ data: { email: `${tag}-admin@example.com`, name: `${tag} Admin`, passwordHash: "x", role: "ADMIN" } });
    const email = `${tag}-twice@example.com`;
    const older = await prisma.classRegistration.create({ data: { fullName: `${tag} Twice`, email, phone: "+12125550121", instrument: "BASS", skillLevel: "BEGINNER", createdAt: new Date(Date.now() - 86_400_000) } });
    const newer = await prisma.classRegistration.create({ data: { fullName: `${tag} Twice`, email, phone: "+12125550121", instrument: "GUITAR", skillLevel: "BEGINNER", notes: "Evenings only" } });
    const forms = (await listDirectory(tag, "APPLICATION")).filter((r) => r.name === `${tag} Twice`);
    expect(forms).toHaveLength(1);
    expect(forms[0].form).toMatchObject({ id: newer.id, notes: "Evenings only" });
    await removeClassRegistration(newer.id, admin.id);
    expect(await prisma.classRegistration.count({ where: { id: newer.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "registration.remove", targetId: newer.id } })).toBe(1);
    await prisma.classRegistration.deleteMany({ where: { id: older.id } });
    await prisma.auditLog.deleteMany({ where: { targetId: newer.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });
});
