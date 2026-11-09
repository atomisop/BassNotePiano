# GL-01-03 review: floating surfaces in Solid, reduced transparency, forced colors, keyboard

Reviewer: Claude (self review; owner has not seen it). Commit 606ce43d, local only.

- Solid pictures (`after/`) and glass pictures (`before/`) of the profile menu, notifications (1440 only; at 390 the bell lives in the profile menu), Atom and the command/shortcut sheet at 1440x900 and 390x844. Solid panels are opaque and legible; glass is unchanged.
- `states/a11y-checks.json` (script `scripts/glass-revamp/a11y-checks.mjs`, 8 of 8 pass): glass surfaces have a backdrop in the normal look; with `prefers-reduced-transparency` and with `forced-colors` none keeps one; Tab reaches 25 controls, all visible, all with a focus ring; Ctrl+K opens the command menu and Escape closes it.
- Real bug found and fixed: the older reduced-transparency rule skipped the dock (and menus, the command scrim, lens panels). It now has the same opaque look as the Solid switch.
- Also fixed: the legend squares on Admin > Data claimed to be unlabeled images (axe `role-img-alt`, 4 nodes); they are decoration now.

Limits: on the dashboard only the dock matches the glass class list in the reduced-transparency check (n=1), so that check proves the rule for the dock and relies on the shared selector list for the rest. The phone-number banner can sit over the right edge of the profile menu on computers (it is a transient popup; left as is). Dark mode and Chromium only for these overlays.
