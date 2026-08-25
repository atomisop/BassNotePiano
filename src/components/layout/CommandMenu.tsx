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

/**
 * ⌘K / Ctrl-K navigation for the signed-in app.
 *
 * Scales come from the static SCALE_GROUPS list rather than the database on
 * purpose: this mounts in the app shell on every authenticated page, and
 * making it wait on a query would either delay the shell or need its own
 * loading state for a menu that isn't open yet. The list is fixed curriculum
 * content, and the routes it links to enforce their own access rules — an
 * unpaid student who picks a locked scale still lands on /billing/curriculum
 * exactly as if they'd clicked it on the roadmap.
 */
export function CommandMenu({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

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
      <CommandInput placeholder="Search scales and pages…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

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
              <span className="font-mono text-[11px] text-[rgb(var(--c-a-400)/0.8)]">{scale.code}</span>
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
            <CommandItem value="admin bookings roster" onSelect={() => go("/admin/bookings")}>
              Class bookings
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
