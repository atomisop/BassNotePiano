# GL-01-01 review: Solid surfaces switch plus the dashboard fixes

Reviewer: Claude (self review; the owner has not yet seen it). Commit 46bfb9f5. Local only, not pushed.

## What changed
- Settings > Appearance has a "Solid surfaces" switch (the shared `<Switch>`). On: every glass surface is an opaque panel, `backdrop-filter` is none, lens layers are not drawn.
  Stored per device (`bnp-solid-surfaces`), set on `<html>` by the boot script before first paint. The same look is used for `forced-colors`.
- `GlassLens` now says whether it IS the panel (`surface`: menus, command menu) or sits on something (highlight, knob, bubble). Solid draws the first as an opaque
  panel with a hairline and the second as a soft fill. `GlassButtons` and `GlassLens` do no lens work when Solid is on.
- Fixes found while capturing the baseline: locked scale cards no longer fade their text (dashboard contrast), the phone-number banner sits under the top bar on
  computers (it covered the controls and caused the target-size finding), and the sidebar's active-row highlight is measured against the nav so it lands behind the row
  (it was drawn at the top left of the sidebar; clear glass hid that).

## Evidence
- Before: baseline dashboard and account shots (dark and light, 3 sizes) from GL-00-01. After: dashboard and Settings > Appearance, dark and light, glass and Solid, 3 sizes; dashboard Solid in WebKit and Firefox at 2 sizes.
- State proof (`states/`): `state-check.json` (click turns it on, glass backdrops are gone, attribute is set before first paint after a reload, still on after reload, Space turns it off) and the command menu in glass and Solid.
- Axe: no serious or critical findings on `/dashboard` and `/account?tab=appearance` (the baseline had color-contrast x5 and target-size x1 on the dashboard). No horizontal overflow at any size.
- Tests: typecheck, lint, 686 unit tests, plus 6 in `classesInWindow` run alone (it times out only when the machine is overloaded). New `tests/solidSurfaces.test.ts`.

## Honest limits
- Light-mode captures exist only for the student pages. Public pages (home, pricing, login, register, classes, terms) are locked to the dark theme by design, so they have no light look. Earlier "light" shots in this run were really dark (the capture script set only the browser's color scheme); they were replaced after the script was fixed.
- Solid mode was reviewed on the dashboard, Settings and the command menu. Other lens users (dialog sheets, lesson tools, video player) are covered by the same CSS but have no Solid screenshots yet; they are checked in the phase that restyles them.
- The wide-screen look of the sidebar highlight changed in glass mode too (it is now placed correctly); the owner should confirm that is wanted.
- Cross-browser: WebKit and Firefox were captured in Solid only, at 1440 and 390.
- Not run here: Lighthouse and keyboard walk-through of every screen (the switch itself is keyboard tested). Performance is unchanged in structure (Solid removes backdrop filters) but was not re-measured on an idle machine.
