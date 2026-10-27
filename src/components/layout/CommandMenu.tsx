"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SCALE_GROUPS } from "@/lib/curriculum";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { quickFindPeopleAction, type QuickFindPerson } from "@/app/(dashboard)/admin/quick-find-actions";

/**
 * ⌘K / Ctrl-K navigation for the signed-in app.
 *
 * Scales come from the static SCALE_GROUPS list rather than the database on
 * purpose: this mounts in the app shell on every authenticated page, and
 * making it wait on a query would either delay the shell or need its own
 * loading state for a menu that isn't open yet. The list is fixed curriculum
 * content, and the routes it links to enforce their own access rules, an
 * unpaid student who picks a locked scale still lands on /billing/plans
 * exactly as if they'd clicked it on the roadmap.
 */
export function CommandMenu({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [people, setPeople] = React.useState<QuickFindPerson[]>([]);

  // Admin: typing a name or email finds the person, so their account is one keystroke away.
  React.useEffect(() => {
    if (!isAdmin || search.trim().length < 2) {
      setPeople([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      quickFindPeopleAction(search).then((rows) => alive && setPeople(rows)).catch(() => alive && setPeople([]));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, isAdmin]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={isAdmin ? "Search a person, a scale or a page…" : "Search scales and pages…"} value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        {isAdmin && people.length > 0 && (
          <CommandGroup heading="People">
            {people.map((p) => (
              <CommandItem
                key={p.id}
                // cmdk filters on `value`; the server already matched, so the typed text is part of it to keep every result visible.
                value={`${search} ${p.name ?? ""} ${p.email}`}
                onSelect={() => go(`/admin/users/${p.id}`)}
              >
                <span className="truncate">{p.name ?? p.email}</span>
                {p.name && <span className="ml-2 truncate text-small text-slate-500">{p.email}</span>}
                {p.banned && <span className="ml-auto text-small text-red-300">Banned</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Go to">
          <CommandItem value="dashboard roadmap home" onSelect={() => go("/dashboard")}>
            Dashboard
          </CommandItem>
          <CommandItem value="classes lessons booking discord zoom" onSelect={() => go("/lessons")}>
            Book a class
          </CommandItem>
          <CommandItem value="messages chat" onSelect={() => go("/messages")}>
            Messages
          </CommandItem>
          <CommandItem value="friends classmates" onSelect={() => go("/friends")}>
            Friends
          </CommandItem>
          <CommandItem value="profile badges streak" onSelect={() => go("/profile")}>
            Profile
          </CommandItem>
          <CommandItem value="parent mode children kids progress pay" onSelect={() => go("/parent")}>
            Parent mode
          </CommandItem>
          <CommandItem value="account settings" onSelect={() => go("/account")}>
            Settings
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Scales">
          {SCALE_GROUPS.map((scale) => (
            <CommandItem
              key={scale.slug}
              // `value` is what cmdk filters on, so the kiñit name and the
              // formula are searchable even though the row shows the title.
              value={`${scale.code} ${scale.title} ${scale.kinitName ?? ""} ${scale.formula}`}
              onSelect={() => go(`/scales/${scale.slug}`)}
            >
              <span className="font-mono text-small text-[rgb(var(--c-s-50)/0.8)]">{scale.code}</span>
              <span className="truncate">{scale.kinitName ?? scale.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {isAdmin && (
          <CommandGroup heading="Admin">
            <CommandItem value="admin overview studio" onSelect={() => go("/admin")}>
              Studio overview
            </CommandItem>
            <CommandItem value="admin students" onSelect={() => go("/admin/students")}>
              Students
            </CommandItem>
            <CommandItem value="admin payments zelle" onSelect={() => go("/admin/payments")}>
              Payments
            </CommandItem>
            <CommandItem value="admin lessons upload" onSelect={() => go("/admin/lessons")}>
              Lesson content
            </CommandItem>
            <CommandItem value="admin bookings roster schedule" onSelect={() => go("/admin/schedule?view=ATTENDANCE")}>
              Class bookings
            </CommandItem>
            <CommandItem value="admin support chat inbox" onSelect={() => go("/admin/support")}>
              Support chat
            </CommandItem>
            <CommandItem value="admin accounts people users" onSelect={() => go("/admin/users")}>
              Accounts
            </CommandItem>
            <CommandItem value="admin pricing prices discount percent off plan" onSelect={() => go("/admin/pricing")}>
              Pricing and discounts
            </CommandItem>
            <CommandItem value="admin credits grant adjust" onSelect={() => go("/admin/payments?tab=credits")}>
              Grant or take credits
            </CommandItem>
            <CommandItem value="admin settings owner switches" onSelect={() => go("/admin/settings")}>
              Settings
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
