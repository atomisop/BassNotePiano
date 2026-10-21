# Accessibility checks

What was checked, how to repeat it, and what only a person with a screen reader can check.

## Automated (axe-core, WCAG 2.2 AA plus best practice)

Run against a local copy with a throwaway database and a seeded admin and student. Copy `axe.min.js` from the `axe-core` npm package into
`public/` (delete it afterwards, never commit it), open a page, load it with a script tag and call
`axe.run(document, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"] } })`.
Cover: every signed-out page, Home, Lessons, Practice, Friends, Messages, Settings (each tab), Billing, the scale page, every admin screen and each
tab of the admin student page, and every overlay (Atom, the payment sheet, What's new, the tour, the command menu, the inbox, the profile menu).
Also repeat Home, Lessons, Settings and Billing with `data-theme="paper"` and `data-mode="light"` set on `<html>`.

Last run (2026-10-21): zero findings in the dark theme everywhere above. Known open item in the light theme: orange text (`text-signal`, #d65c2c)
is 3.1 to 3.5:1 on the light surfaces, under the 4.5:1 that small text needs. Fixing it means a darker orange for light mode and white text on
orange buttons there, which is a brand decision.

## Keyboard (done by hand)

Tab through Home: every stop shows a focus ring and the order follows the page. Every modal moves focus in when it opens, keeps Tab inside
(`src/hooks/useDialogFocus.ts`), closes on Escape and returns focus. Layout at 320 px wide (400% zoom) has no sideways scroll except the
deliberate chip rows.

## Screen reader (needs a person)

Nothing here can replace VoiceOver (Mac and iPhone) or NVDA (Windows). Ten minutes each:
1. Sign-up and sign-in: every field announces its label, errors are read out, the code screen says what to do.
2. Home: headings (rotor or `H`) go Home, Your scales; the first-week checklist says "done" or "not done yet"; the streak dots read "Thursday: not practiced".
3. Lessons and Billing: the My plan summary reads as one block; the payment sheet reads its title, and the copy buttons say what they copy.
4. Open Atom: the notice about what is kept is read before the input.
5. Admin: the student page tabs announce as pressed or not; the bulk bar announces "N selected".
