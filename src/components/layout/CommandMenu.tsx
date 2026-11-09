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
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Kbd";
import { markKeyboardAction } from "@/lib/keyboardMotion";
import { OPEN_SUPPORT, announce } from "@/lib/topBarEvents";
import {
  ACTION_SHORTCUTS,
  CHORD_WINDOW_MS,
  GO_SHORTCUTS,
  isTypingTarget,
  nextShortcutStep,
  OPEN_COMMAND_EVENT,
  OPEN_SHORTCUTS_EVENT,
  TOGGLE_SIDEBAR_EVENT,
  goKeysFor,
} from "@/lib/shortcuts";
import { readRecentCommands, rememberCommand, personActionHref, personActionLabel, personActionsFor, type RecentCommand } from "@/lib/commandRecents";
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
 *
 * The jobs offered for a person found by name (PERSON_ACTIONS) live in lib/commandRecents.ts with the `?do=` links they open.
 */
export function CommandMenu({ isAdmin, isOwner = false }: { isAdmin: boolean; isOwner?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [people, setPeople] = React.useState<QuickFindPerson[]>([]);
  const [helpOpen, setHelpOpen] = React.useState(false);

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

  // Every keyboard shortcut lives here: Cmd/Ctrl-K, "/", "?", "B" and the two-key "G then a letter" jumps (see lib/shortcuts.ts).
  React.useEffect(() => {
    let goPending = false;
    let timer: number | undefined;
    const clear = () => {
      goPending = false;
      window.clearTimeout(timer);
    };
    function onKeyDown(e: KeyboardEvent) {
      // Escape closes the menu (and any sheet) from the keyboard, so it closes without the animation too.
      if (e.key === "Escape") markKeyboardAction();
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        markKeyboardAction();
        setOpen((prev) => !prev);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTypingTarget(e.target)) return;
      const step = nextShortcutStep(e.key, goPending, isAdmin);
      if (step.kind === "wait") {
        e.preventDefault();
        goPending = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(clear, CHORD_WINDOW_MS);
      } else if (step.kind === "go") {
        e.preventDefault();
        clear();
        markKeyboardAction();
        router.push(step.href);
      } else if (step.kind === "event") {
        e.preventDefault();
        clear();
        markKeyboardAction();
        window.dispatchEvent(new Event(step.name));
      } else if (goPending) {
        clear();
      }
    }
    const openCommand = () => setOpen(true);
    const openHelp = () => setHelpOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_EVENT, openCommand);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_EVENT, openCommand);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
      clear();
    };
  }, [router, isAdmin]);

  // The last few things picked from here, shown first when the box is empty, so a repeat job is one keystroke.
  const [recent, setRecent] = React.useState<RecentCommand[]>([]);
  React.useEffect(() => {
    setRecent(readRecentCommands());
  }, [open]);

  const go = React.useCallback(
    (href: string, label?: string) => {
      setOpen(false);
      if (label) setRecent(rememberCommand({ href, label }));
      router.push(href);
    },
    [router],
  );

  const hint = (href: string) => {
    const keys = goKeysFor(href);
    return keys ? (
      <CommandShortcut>
        <Kbd keys={keys} />
      </CommandShortcut>
    ) : null;
  };

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={isAdmin ? "Search a person, a scale or a page…" : "Search scales and pages…"} value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        {isAdmin && !search.trim() && recent.length > 0 && (
          <CommandGroup heading="Recent">
            {recent.map((r) => (
              <CommandItem key={r.href + r.label} value={`recent ${r.label}`} onSelect={() => go(r.href, r.label)}>
                <span className="truncate">{r.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {isAdmin && people.length > 0 && (
          <CommandGroup heading="People">
            {people.map((p) => (
              <CommandItem
                key={p.id}
                // cmdk filters on `value`; the server already matched, so the typed text is part of it to keep every result visible.
                value={`${search} ${p.name ?? ""} ${p.email}`}
                onSelect={() => go(`/admin/users/${p.id}`, p.name ?? p.email)}
              >
                <span className="truncate">{p.name ?? p.email}</span>
                {p.name && <span className="ml-2 truncate text-small text-slate-500">{p.email}</span>}
                {p.banned && <span className="ml-auto text-small text-red-300">Banned</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* The jobs done most, for the first people found: type a name, then pick what to do. They open the account with that job ready. */}
        {isAdmin && people.length > 0 && people.length <= 3 && (
          <CommandGroup heading="Do for this person">
            {people.flatMap((p) => {
              const who = (p.name ?? p.email).split(" ")[0];
              return personActionsFor(people.length, isOwner).map((a) => (
                <CommandItem
                  key={`${p.id}-${a.id}`}
                  value={`${search} ${p.name ?? ""} ${p.email} ${a.id} ${a.keywords}`}
                  onSelect={() => go(personActionHref(p.id, a.id), personActionLabel(a, who))}
                >
                  <span className="truncate">{personActionLabel(a, who)}</span>
                </CommandItem>
              ));
            })}
          </CommandGroup>
        )}

        <CommandGroup heading="Go to">
          <CommandItem value="home dashboard start" onSelect={() => go("/dashboard")}>
            Home
            {hint("/dashboard")}
          </CommandItem>
          <CommandItem value="roadmap scales course curriculum" onSelect={() => go("/roadmap")}>
            Roadmap
            {hint("/roadmap")}
          </CommandItem>
          <CommandItem value="classes lessons booking discord zoom" onSelect={() => go("/lessons")}>
            Book a class
            {hint("/lessons")}
          </CommandItem>
          <CommandItem value="support help message contact" onSelect={() => { announce(OPEN_SUPPORT); setOpen(false); }}>
            Message support
          </CommandItem>
          <CommandItem value="friends classmates" onSelect={() => go("/friends")}>
            Friends
            {hint("/friends")}
          </CommandItem>
          <CommandItem value="profile badges streak" onSelect={() => go("/profile")}>
            Profile
            {hint("/profile")}
          </CommandItem>
          <CommandItem value="parent mode children kids progress pay" onSelect={() => go("/parent")}>
            Parent mode
          </CommandItem>
          <CommandItem value="account settings" onSelect={() => go("/account")}>
            Settings
            {hint("/account")}
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Do">
          <CommandItem
            value="collapse expand sidebar toggle rail"
            onSelect={() => {
              setOpen(false);
              window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT));
            }}
          >
            Collapse or expand the sidebar
            <CommandShortcut>
              <Kbd keys={["B"]} />
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            value="keyboard shortcuts help keys"
            onSelect={() => {
              setOpen(false);
              setHelpOpen(true);
            }}
          >
            Keyboard shortcuts
            <CommandShortcut>
              <Kbd keys={["?"]} />
            </CommandShortcut>
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
              <span className="font-mono text-small text-slate-50/80">{scale.code}</span>
              <span className="truncate">{scale.kinitName ?? scale.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Admins also get each scale's lesson files, so adding or reordering a lesson starts from here, not from the student player. */}
        {isAdmin && (
          <CommandGroup heading="Lessons">
            {SCALE_GROUPS.map((scale) => (
              <CommandItem
                key={`lessons-${scale.slug}`}
                value={`lessons files upload ${scale.code} ${scale.title} ${scale.kinitName ?? ""}`}
                onSelect={() => go(`/admin/lessons?scale=${scale.slug}`, `Lessons for ${scale.code}`)}
              >
                Lessons for {scale.code}
                <span className="ml-2 truncate text-small text-slate-500">{scale.kinitName ?? scale.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {isAdmin && (
          <CommandGroup heading="Admin">
            <CommandItem value="admin overview studio" onSelect={() => go("/admin", "Studio overview")}>
              Studio overview
            {hint("/admin")}
            </CommandItem>
            <CommandItem value="admin today classes teaching day" onSelect={() => go("/admin/today", "Today")}>
              Today
              {hint("/admin/today")}
            </CommandItem>
            <CommandItem value="admin applicants applications students trial" onSelect={() => go("/admin/students", "Applicants")}>
              Applicants
            </CommandItem>
            <CommandItem value="admin payments zelle" onSelect={() => go("/admin/payments", "Payments")}>
              Payments
            {hint("/admin/payments")}
            </CommandItem>
            <CommandItem value="admin plans payment plans subscriptions pause" onSelect={() => go("/admin/payment-plans", "Plans")}>
              Plans
            </CommandItem>
            <CommandItem value="admin schedule weekly times slots reserved" onSelect={() => go("/admin/schedule", "Schedule")}>
              Schedule
            </CommandItem>
            <CommandItem value="admin lessons upload" onSelect={() => go("/admin/lessons", "Lesson content")}>
              Lesson content
            </CommandItem>
            <CommandItem value="admin bookings roster schedule" onSelect={() => go("/admin/schedule?view=ATTENDANCE", "Class bookings")}>
              Class bookings
            </CommandItem>
            <CommandItem value="admin support chat inbox" onSelect={() => go("/admin/support", "Support chat")}>
              Support chat
              {hint("/admin/support")}
            </CommandItem>
            <CommandItem value="admin messages write mail" onSelect={() => go("/admin/messages", "Messages")}>
              Messages
            </CommandItem>
            <CommandItem value="admin announcements announce everyone news" onSelect={() => go("/admin/messages?tab=announcements", "Announcements")}>
              Announcements
            </CommandItem>
            <CommandItem value="admin accounts people users" onSelect={() => go("/admin/users", "Accounts")}>
              Accounts
            </CommandItem>
            <CommandItem value="admin pricing prices discount percent off plan" onSelect={() => go("/admin/pricing", "Pricing and discounts")}>
              Pricing and discounts
            </CommandItem>
            <CommandItem value="admin credits grant adjust" onSelect={() => go("/admin/payments?tab=credits", "Grant or take credits")}>
              Grant or take credits
            </CommandItem>
            <CommandItem value="admin settings owner switches" onSelect={() => go("/admin/settings", "Settings")}>
              Settings
            </CommandItem>
            {isOwner && (
              <>
                <CommandItem value="admin activity log audit changes history" onSelect={() => go("/admin/activity", "Activity")}>
                  Activity
                </CommandItem>
                <CommandItem value="admin system automatic tasks jobs security page views" onSelect={() => go("/admin/security", "System")}>
                  System
                </CommandItem>
                <CommandItem value="admin roadmaps scales chapters curriculum" onSelect={() => go("/admin/roadmaps", "Roadmaps")}>
                  Roadmaps
                </CommandItem>
              </>
            )}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen} title="Keyboard shortcuts">
      <div className="space-y-5 text-small">
        <section>
          <h3 className="mb-2 font-semibold text-slate-50">Anywhere</h3>
          <ul className="space-y-2">
            {ACTION_SHORTCUTS.map((a) => (
              <li key={a.keys.join("+")} className="flex items-center justify-between gap-3 text-slate-300">
                {a.label}
                <Kbd keys={a.keys} className="[@media(hover:none)]:inline-flex" />
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 font-semibold text-slate-50">Go to (press G, then the letter)</h3>
          <ul className="space-y-2">
            {GO_SHORTCUTS.filter((g) => !g.adminOnly || isAdmin).map((g) => (
              <li key={g.key} className="flex items-center justify-between gap-3 text-slate-300">
                {g.label}
                <Kbd keys={["G", g.key.toUpperCase()]} className="[@media(hover:none)]:inline-flex" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Dialog>
    </>
  );
}
