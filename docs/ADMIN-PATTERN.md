# One pattern for every admin screen (added 2026-11-05)

The admin area had many menus inside menus. Every admin screen now follows the same four rules, so a person learns where things sit once.

1. **Two levels, never three.** The admin menu holds six sections (`src/lib/adminNav.ts`). A section shows its everyday pages as tabs and
   tucks the rest under a **More** tab (`more: true` on the page; `splitHubPages`, drawn by `AdminSectionTabs`). Aim for three tabs or fewer.
   A page must never add a third row of tabs inside itself; use sections (rule 3) or filter pills.
2. **Actions sit next to the thing they change.** A button that changes a plan belongs in the plan's menu, one that changes classes next to
   the class list. The top row of a person's page holds only the jobs done every day (Message, Add credits, Book a class, one Notify switch)
   and one **Plan** menu (`ActionMenu`, `src/components/ui/ActionMenu.tsx`). A job appears once per screen: one Notify switch, one Book a class.
3. **A long page is one scroll, not tabs.** A person's page is six sections on one page (`CustomerProfile`), each opening and closing on its
   own header, with a sticky index that jumps to one and follows what is on screen. The section in the address (`#money`) opens and scrolls to it.
4. **Rare or risky tools go under "Advanced".** Owner-only and seldom-used actions sit in the menu below an "Advanced (owner)" label
   (`ActionMenuLabel`), never in the always-visible toolbar.

Ways to reach a job without menus:

- **Command menu (Cmd/Ctrl-K)**: type a name, then pick "Add credits for X", "Book a class for X", "Plan tools for X" or "See payments for X".
  These open the person's page with the job ready (`?do=credits|book|plan|payments`, `src/lib/commandRecents.ts`). The last four picks show as **Recent**.
- **Overview > Needs you** (`src/lib/needsYou.ts`): the jobs waiting right now, each one tap from where it is done.
- **Accounts side panel** (`PersonPeekPanel`): on a computer a tap on a row opens a summary beside the list; a phone, or a modifier key, opens the full page.

Adding a new admin action: put it next to what it changes; if it is owner-only or rare, put it under Advanced; if it is a daily job, add it to the
command menu's `PERSON_ACTIONS` with a `?do=` handler in `CustomerProfile`.
