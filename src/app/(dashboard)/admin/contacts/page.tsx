import Link from "next/link";
import { ChevronRight, Plus } from "@/components/ui/appIcons";
import { listDirectory, type PersonKind } from "@/lib/contacts";
import { Meta } from "@/components/ui/CardKit";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import { Card } from "@/components/ui/Card";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";
import { ClassFormEntry, ContactForm } from "@/components/admin/ContactPanels";
import { createContactAction, removeClassFormAction } from "./actions";

export const metadata = { title: "Admin: Contacts" };

const FILTERS: { label: string; value: PersonKind | "ALL" }[] = [
  // Short labels, so the four fit across a 320px phone without running off the edge.
  { label: "All", value: "ALL" },
  { label: "Accounts", value: "ACCOUNT" },
  { label: "Class form", value: "APPLICATION" },
  { label: "Added", value: "ADDED" },
];

// What kind of entry a row is: a quiet word in its meta line (a fact, not a coloured badge), and only on the All tab.
const KIND_LABEL: Record<PersonKind, string> = {
  ACCOUNT: "Account",
  APPLICATION: "Class form",
  ADDED: "Added",
};

function day(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

type Person = Awaited<ReturnType<typeof listDirectory>>[number];

/** Splits the list into runs, in order: each class-form entry on its own, and the people between them together. */
function runs(people: Person[]): { form: boolean; people: Person[] }[] {
  const out: { form: boolean; people: Person[] }[] = [];
  for (const person of people) {
    const last = out[out.length - 1];
    if (!person.form && last && !last.form) last.people.push(person);
    else out.push({ form: !!person.form, people: [person] });
  }
  return out;
}

export default async function AdminContactsPage(props: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const { q = "", show = "" } = await props.searchParams;
  const active = FILTERS.find((f) => f.value === show.toUpperCase())?.value ?? "ALL";
  const people = await listDirectory(q, active);
  const href = (value: string) => `/admin/contacts${value === "ALL" ? "" : `?show=${value}`}${q ? `${value === "ALL" ? "?" : "&"}q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div>
      <h1 className="sr-only">Contacts</h1>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className={TAB_TRACK}>
          {FILTERS.map((filter) => (
            <Link key={filter.value} href={href(filter.value)} className={tabItem(active === filter.value)}>
              {filter.label}
            </Link>
          ))}
        </div>
        {/* Open, the form takes its own row under the button, so it never runs past the edge of the screen. */}
        <details className="group ml-auto text-right open:w-full">
          <summary className="press inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-control bg-neu-base px-3.5 text-small font-semibold text-slate-100 shadow-raised-low [&::-webkit-details-marker]:hidden">
            <Plus className="h-4 w-4" aria-hidden /> Add person
          </summary>
          <Card className="mt-3 ml-auto w-full max-w-xl text-left">
            <ContactForm submitLabel="Save" onSave={createContactAction} openAfterSave />
          </Card>
        </details>
      </div>

      <form className="mt-4" action="/admin/contacts">
        {active !== "ALL" && <input type="hidden" name="show" value={active} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email or phone"
          className="h-10 w-full max-w-md rounded-control border border-(--neu-edge) bg-neu-base px-3 text-body text-slate-50 shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>

      {people.length === 0 && (
        <p className="mt-5 rounded-card bg-neu-base px-4 py-8 text-center text-small text-slate-400 shadow-raised-low">
          {q ? `Nobody matches "${q}".` : active === "APPLICATION" ? "Nobody has sent the class form yet." : "Nobody here yet. Tap Add person."}
        </p>
      )}
      {/* People are rows in one box (name first, the facts in one quiet line, the next class on the right). Someone who sent the class
          form is its own card between them, because it carries what they typed and the buttons to reach them. Order is kept. */}
      <div className="mt-5 grid gap-2">
        {runs(people).map((run) =>
          run.form ? (
            <ClassFormEntry
              key={run.people[0].key}
              id={run.people[0].form!.id}
              name={run.people[0].name}
              email={run.people[0].email ?? ""}
              phone={run.people[0].phone ?? ""}
              instrument={INSTRUMENT_LABEL[run.people[0].detail as keyof typeof INSTRUMENT_LABEL] ?? "Not said"}
              level={SKILL_LABEL[run.people[0].form!.skillLevel as keyof typeof SKILL_LABEL] ?? run.people[0].form!.skillLevel}
              notes={run.people[0].form!.notes}
              sent={day(run.people[0].form!.sentAt)}
              onRemove={removeClassFormAction}
            />
          ) : (
            <ul key={run.people[0].key} className="divide-y divide-slate-50/6 overflow-hidden rounded-card bg-neu-base shadow-raised-low">
              {run.people.map((person) => {
                const instrument = person.detail ? (INSTRUMENT_LABEL[person.detail as keyof typeof INSTRUMENT_LABEL] ?? null) : null;
                return (
                  <li key={person.key}>
                    <Link href={person.href} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-semibold text-slate-50">{person.name}</p>
                        <Meta className="truncate" items={[active === "ALL" ? KIND_LABEL[person.kind] : null, person.reserved, instrument, person.phone, person.email]} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-body font-semibold tabular-nums ${person.nextClass || person.classesTaken > 0 ? "text-slate-50" : "text-slate-500"}`}>
                          {person.nextClass ? day(person.nextClass) : person.classesTaken > 0 ? person.classesTaken : "None"}
                        </p>
                        <p className="text-caption text-slate-500">
                          {person.nextClass ? "Next class" : person.classesTaken > 0 ? (person.classesTaken === 1 ? "class" : "classes") : "Classes"}
                        </p>
                      </div>
                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ),
        )}
      </div>
    </div>
  );
}
