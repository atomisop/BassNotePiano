import Link from "next/link";
import { ChevronRight } from "@/components/ui/appIcons";
import type { listDirectory } from "@/lib/contacts";
import { Meta } from "@/components/ui/CardKit";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import { ClassFormEntry } from "@/components/admin/ContactPanels";
import { removeClassFormAction, sendClassFormSignUpAction } from "@/app/(dashboard)/admin/contacts/actions";

// What kind of entry a row is: a quiet word in its meta line (a fact, not a coloured badge).
const KIND_LABEL = { ACCOUNT: "Account", APPLICATION: "Class form", ADDED: "Added" } as const;

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

/**
 * The people who have no account yet (they sent the class form, or the studio added them by hand), shown on the People page under
 * the accounts. Rows read like account rows (name, one quiet line of facts, the next class on the right); someone who sent the class
 * form is its own card, because it carries what they typed and the buttons to reach them. Order is kept.
 */
export function DirectorySection({ people, showKind = true }: { people: Person[]; showKind?: boolean }) {
  return (
    <div className="grid gap-2">
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
            onSendSignUp={sendClassFormSignUpAction}
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
                      <Meta className="truncate" items={[showKind ? KIND_LABEL[person.kind] : null, person.reserved, instrument, person.phone, person.email]} />
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
  );
}
