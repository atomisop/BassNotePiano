P1-MUS-02 (lesson screen), P1-MUS-03 (playable audio), P1-MUS-04 (MIDI), P1-MUS-05 (scoring). New feature, so there is no "before" screenshot.

Built: /practice/piano with Listen, Guided and From memory modes, a playable 13-key piano (pointer, touch, computer keys, Tab+Space), Web Audio sound (no sample files), optional Web MIDI, a labelled progress bar, live feedback announced to screen readers, and a result card. Scoring is pure and tested: one attempt per note, wrong notes do not advance, a note repeated within 60 ms counts once, nothing counts after the end.

Verified automatically (24 e2e + 14 unit): oscillators really start when a key is played; a full run with one wrong note scores 86% over 7 attempts and names C4 as the retry; memory mode shows no outline and does not reveal the answer; computer keys, Tab+Space and a mocked MIDI keyboard drive the same path; a denied MIDI permission leaves the on-screen keys working; axe finds no serious or critical issue at 1440, 390 and 320.

Bugs the tests caught and I fixed: hydration mismatch (MIDI support was decided during render), black keys under the WCAG 2.2 24px target at 320px, the result card sitting under the dock on small phones, and a splice that put the keyboard inside the result card (typecheck could not see it; the e2e did).

NOT done / NOT verified:
- Nobody has LISTENED to the sound. "Oscillators start" is not proof it sounds good or is audible on iOS. Manual listening QA is required before P1-MUS-03 can be called done.
- MIDI is tested with a mock only. No real keyboard was available: hardware QA is BLOCKED.
- Content: the exercise is a plain five-note scale, labelled as a teaching exercise. P1-MUS-01 (teacher-approved Ethiopian content) is BLOCKED on a teacher. Nothing here claims to be Tizita or any qenet.
- P1-MUS-06 persistence: results are NOT saved (the screen says so). It needs a new table and a hand-written migration.
- No Listen-mode speed, loop or metronome (P1-MUS-07), no adaptive review (P1-MUS-08), no teacher feedback (P1-MUS-09), no offline support (P1-MUS-10).
- No VoiceOver or NVDA pass. No light theme (the app's light theme was not captured).
