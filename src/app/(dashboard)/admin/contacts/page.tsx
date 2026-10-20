import Link from "next/link";
import { listContacts } from "@/lib/contacts";
import { INSTRUMENT_LABEL } from "@/lib/classRegistrationLabels";
import { Card } from "@/components/ui/Card";
import { ContactForm } from "@/components/admin/ContactPanels";
import { createContactAction } from "./actions";

export const metadata = { title: "Admin: Contacts" };

const STATUS_LABEL: Record<string, string> = { INTERESTED: "Interested", TRIAL: "Trial", ACTIVE: "Active", PAUSED: "Paused" };

function day(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function AdminContactsPage(props: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await props.searchParams;
  const contacts = await listContacts(q);

  return (
    <div>
      <p className="text-small font-medium text-slate-400">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Contacts</h1>
      <p className="mt-2 max-w-[60ch] text-small text-slate-400">
        People you keep track of who do not have an account. Save their details, the days they took a class, and reserve their usual weekly time so you do not book it for someone else.
      </p>

      <details className="mt-6 group">
        <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-control bg-neu-base px-4 text-small font-semibold text-slate-100 shadow-raised-low [&::-webkit-details-marker]:hidden">
          Add a person
        </summary>
        <Card className="mt-4">
          <ContactForm submitLabel="Save person" onSave={createContactAction} openAfterSave />
        </Card>
      </details>

      <form className="mt-6" action="/admin/contacts">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name, email or phone"
          className="h-10 w-full max-w-md rounded-control border border-(--neu-edge) bg-neu-base px-3 text-body text-slate-50 shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>

      <ul className="mt-6 grid gap-2">
        {contacts.length === 0 && <li className="text-small text-slate-500">{q ? `Nobody matches "${q}".` : "No contacts yet."}</li>}
        {contacts.map((contact) => (
          <li key={contact.id}>
            <Link href={`/admin/contacts/${contact.id}`} className="press-soft flex items-center justify-between gap-4 rounded-card bg-neu-base px-4 py-3 shadow-raised-low hover:shadow-raised-mid">
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-slate-50">{contact.name}</p>
                <p className="truncate text-small text-slate-400">
                  {[contact.instrument ? INSTRUMENT_LABEL[contact.instrument] : null, contact.phone, contact.email].filter(Boolean).join(" · ") || "No details yet"}
                </p>
              </div>
              <div className="shrink-0 text-right text-small text-slate-400">
                <p className="font-medium text-slate-200">{STATUS_LABEL[contact.status]}</p>
                <p>
                  {contact.activeHolds > 0 ? `${contact.activeHolds} reserved · ` : ""}
                  {contact.sessionCount > 0 ? `last class ${contact.lastSession ? day(contact.lastSession) : ""}` : "no classes yet"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
