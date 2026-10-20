import Link from "next/link";
import { Plus } from "lucide-react";
import { listDirectory, type PersonKind } from "@/lib/contacts";
import { INSTRUMENT_LABEL } from "@/lib/classRegistrationLabels";
import { Card } from "@/components/ui/Card";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";
import { ContactForm } from "@/components/admin/ContactPanels";
import { createContactAction } from "./actions";

export const metadata = { title: "Admin: Contacts" };

const FILTERS: { label: string; value: PersonKind | "ALL" }[] = [
  { label: "Everyone", value: "ALL" },
  { label: "Accounts", value: "ACCOUNT" },
  { label: "Applied", value: "APPLICATION" },
  { label: "Added by you", value: "ADDED" },
];

const KIND_TAG: Record<PersonKind, { label: string; className: string }> = {
  ACCOUNT: { label: "Account", className: "bg-[rgb(var(--signal)/0.16)] text-signal" },
  APPLICATION: { label: "Applied", className: "bg-slate-700/40 text-slate-200" },
  ADDED: { label: "Added", className: "bg-slate-700/40 text-slate-200" },
};

function day(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

export default async function AdminContactsPage(props: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const { q = "", show = "" } = await props.searchParams;
  const active = FILTERS.find((f) => f.value === show.toUpperCase())?.value ?? "ALL";
  const people = await listDirectory(q, active);
  const href = (value: string) => `/admin/contacts${value === "ALL" ? "" : `?show=${value}`}${q ? `${value === "ALL" ? "?" : "&"}q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div>
      <p className="text-small font-medium text-slate-400">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Contacts</h1>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className={TAB_TRACK}>
          {FILTERS.map((filter) => (
            <Link key={filter.value} href={href(filter.value)} className={tabItem(active === filter.value)}>
              {filter.label}
            </Link>
          ))}
        </div>
        <details className="group ml-auto">
          <summary className="press inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-control bg-neu-base px-3.5 text-small font-semibold text-slate-100 shadow-raised-low [&::-webkit-details-marker]:hidden">
            <Plus className="h-4 w-4" aria-hidden /> Add person
          </summary>
          <Card className="mt-3 w-[min(36rem,calc(100vw-2rem))]">
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

      <ul className="mt-5 grid gap-2">
        {people.length === 0 && (
          <li className="rounded-card bg-neu-base px-4 py-8 text-center text-small text-slate-400 shadow-raised-low">
            {q ? `Nobody matches "${q}".` : "Nobody here yet. Tap Add person."}
          </li>
        )}
        {people.map((person) => {
          const tag = KIND_TAG[person.kind];
          const sub = [person.detail ? (INSTRUMENT_LABEL[person.detail as keyof typeof INSTRUMENT_LABEL] ?? null) : null, person.phone, person.email].filter(Boolean).join(" · ");
          return (
            <li key={person.key}>
              <Link href={person.href} className="press-soft flex items-center justify-between gap-4 rounded-card bg-neu-base px-4 py-3 shadow-raised-low hover:shadow-raised-mid">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-body font-semibold text-slate-50">{person.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-small font-medium ${tag.className}`}>{tag.label}</span>
                  </p>
                  {sub && <p className="truncate text-small text-slate-400">{sub}</p>}
                </div>
                <div className="shrink-0 text-right text-small text-slate-400">
                  {person.reserved && <p className="font-medium text-signal">{person.reserved}</p>}
                  <p>
                    {person.classesTaken > 0 ? `${person.classesTaken} ${person.classesTaken === 1 ? "class" : "classes"}` : "No classes yet"}
                    {person.nextClass ? ` · next ${day(person.nextClass)}` : person.lastClass ? ` · last ${day(person.lastClass)}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
