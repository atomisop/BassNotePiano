# GL-01-05 review: Tailwind backdrop-blur panels honor Solid and reduced transparency

Reviewer: Claude (self review; owner has not seen it). Local only.

Gap found by auditing every `backdrop-blur` in `src`: the top notification banner, the dialog and navigation scrims and the marketing nav blur the page with Tailwind utilities, which neither the Solid switch nor the OS reduce-transparency rule reached. A CSS block now removes the blur for them in both cases (and for forced colors); a scrim stays a plain dim layer and every other blurred panel turns opaque.

Evidence: `states/blur-utility-check.json` (6 of 6 pass): `/dashboard` and `/pricing` each have a blur-utility element in the normal look, and none in Solid or with reduced transparency. After pictures of the dashboard in Solid (1440, 390, 320) show the banner opaque; axe on the 1440 capture is clean; no overflow.

Limits: the dialog and navigation scrims were covered by the same selector but are not shown open in a picture; `/pricing` was checked by element count, not by a picture of the lifted nav. Chromium and dark only.
