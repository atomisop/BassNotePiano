import { notFound } from "next/navigation";
import { findContactAccount, getContact, getHoldChoices } from "@/lib/contacts";
import { Card } from "@/components/ui/Card";
import { BackToContacts, ContactAccountCard, ContactForm, ContactHolds, ContactSessions, type HoldRow, type SessionRow } from "@/components/admin/ContactPanels";
import { addHoldAction, addSessionAction, deleteContactAction, deleteSessionAction, releaseHoldAction, sendContactSignUpAction, updateContactAction } from "../actions";
import { DeleteContactButton } from "./DeleteContactButton";

export const metadata = { title: "Admin: Contact" };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function utcDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function AdminContactPage(props: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await props.params;
  const [contact, choices] = await Promise.all([getContact(contactId), getHoldChoices()]);
  if (!contact) notFound();
  const account = await findContactAccount(contact.email);

  const labelFor = (scheduleId: string, chunkIndex: number, fallbackDay: number) =>
    choices.find((c) => c.scheduleId === scheduleId && c.chunkIndex === chunkIndex)?.label ?? `${DAY_NAMES[fallbackDay]} (time no longer offered)`;

  const holds: HoldRow[] = contact.holds.map((hold) => ({
    id: hold.id,
    label: labelFor(hold.scheduleId, hold.chunkIndex, hold.schedule.dayOfWeek),
    until: hold.until ? utcDay(hold.until) : null,
    note: hold.note,
    releasedAt: hold.releasedAt ? hold.releasedAt.toISOString() : null,
  }));
  const sessions: SessionRow[] = contact.sessions.map((s) => ({ id: s.id, day: utcDay(s.date), attended: s.attended, note: s.note }));
  // The times still kept for them, still offered: each becomes "Set up plan with <time>" once they have an account.
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const heldTimes = contact.holds
    .filter((h) => !h.releasedAt && (!h.until || h.until.getTime() >= today) && choices.some((c) => c.scheduleId === h.scheduleId && c.chunkIndex === h.chunkIndex))
    .map((h) => ({ key: `${h.scheduleId}:${h.chunkIndex}`, label: labelFor(h.scheduleId, h.chunkIndex, h.schedule.dayOfWeek) }));

  return (
    <div>
      <BackToContacts />
      <h1 className="mt-3 px-1 text-headline font-semibold text-balance text-slate-50">{contact.name}</h1>
      <div className="mt-6 grid gap-4">
        <ContactAccountCard contactId={contact.id} email={contact.email} account={account} heldTimes={heldTimes} onSendSignUp={sendContactSignUpAction} />
        <Card>
          <h2 className="mb-4 text-title font-semibold text-slate-50">Details</h2>
          <ContactForm
            initial={{
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              instrument: contact.instrument,
              skillLevel: contact.skillLevel,
              source: contact.source,
              notes: contact.notes,
              status: contact.status,
            }}
            submitLabel="Save changes"
            onSave={updateContactAction.bind(null, contact.id)}
          />
        </Card>
        <ContactHolds contactId={contact.id} holds={holds} choices={choices} onAdd={addHoldAction} onRelease={releaseHoldAction} />
        <ContactSessions contactId={contact.id} sessions={sessions} onAdd={addSessionAction} onDelete={deleteSessionAction} />
        <DeleteContactButton contactId={contact.id} name={contact.name} onDelete={deleteContactAction} />
      </div>
    </div>
  );
}
