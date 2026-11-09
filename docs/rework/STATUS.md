# Rework status

Source plan: Rework.md (owner's copy). Update after every task; a task is DONE only when `npm run rework:verify` passes.

| Task | Status | Branch | Commit | Evidence |
|---|---|---|---|---|
| P0-OPS-01 evidence gate | IN PROGRESS (verifier, capture, typecheck, lint, unit tests done; e2e specs pending) | rework/phase0-evidence-gate | | docs/rework/evidence/P0-OPS-01 |
| P0-OPS-02 route atlas | NOT STARTED | | | |
| P0-OPS-03 baseline gates | NOT STARTED | | | |
| P0-SEC-01 payment email | IN PROGRESS: reviewed, replay race closed, no vulnerability found | rework/phase0-evidence-gate | 8d4b6f6e | docs/rework/evidence/P0-SEC-01 |
| P0-SEC-02 booking and credits | IN PROGRESS: contention verified, no defect; DST/refund cases not done | rework/phase0-evidence-gate | 8d4b6f6e | docs/rework/evidence/P0-SEC-02 |
| P0-SEC-03 role boundaries | IN PROGRESS: admin guards verified and locked by a test; student IDOR checks not done | rework/phase0-evidence-gate | 8d4b6f6e | docs/rework/evidence/P0-SEC-03 |
| P0-BIZ-01 pricing fallback | IN PROGRESS: money paths now strict, stale notice added; no screenshot yet | rework/phase0-evidence-gate | 8d4b6f6e | docs/rework/evidence/P0-BIZ-01 |
| P1-ONB-01 two-step onboarding | DONE (pending owner approval) | rework/phase0-evidence-gate | 6be15446 | docs/rework/evidence/P1-ONB-01 |
| P1-ONB-03 instrument carry-through | DONE (same evidence) | rework/phase0-evidence-gate | 6be15446 | docs/rework/evidence/P1-ONB-01 |
| P1-A11Y-01 onboarding semantics | IN PROGRESS (automated done, screen reader pass pending) | rework/phase0-evidence-gate | 6be15446 | docs/rework/evidence/P1-ONB-01 |
| P1-ONB-02 welcome / first action | EXISTS (dashboard Start here hero); not re-verified with screenshots | | | |
| P1-PAY-01 pricing badges | PARTIAL, badge claims fixed (pending owner approval) | rework/phase0-evidence-gate | 1fa98ef4 | docs/rework/evidence/P1-PAY-01 |
| P1-MUS-01 teacher-approved Ethiopian content | BLOCKED: needs the teacher to review qenet names, phrases and notation | | | |
| P1-MUS-02 piano lesson screen | IN PROGRESS: built and tested, content unapproved | rework/phase0-evidence-gate | ef5c6143 | docs/rework/evidence/P1-MUS-02 |
| P1-MUS-03 playable audio | IN PROGRESS: measured in automation, nobody has listened yet | rework/phase0-evidence-gate | ef5c6143 | docs/rework/evidence/P1-MUS-02 |
| P1-MUS-04 MIDI keyboard | IN PROGRESS: mocked tests pass, real hardware BLOCKED | rework/phase0-evidence-gate | ef5c6143 | docs/rework/evidence/P1-MUS-02 |
| P1-MUS-05 scoring and feedback | DONE in code and tests (pending owner approval) | rework/phase0-evidence-gate | ef5c6143 | docs/rework/evidence/P1-MUS-02 |
| P1-MUS-06 save progress | IN PROGRESS: finished runs saved and tested; resume-after-reload and streak links not done. Migration is not on production until merged | rework/phase0-evidence-gate | ab4e121d | docs/rework/evidence/P1-MUS-06 |
| P1-HOME-01/02 home next action and class | IN PROGRESS: home already had one hero action and a next-class row with date and ET; added tested join-readiness wording. No instructor name shown (none is stored per class). No screenshots yet, so not done | rework/phase0-evidence-gate | | |
| P1-PAY-04 readable prices | IN PROGRESS: animated price now has one real text copy (sr-only), reel digits drawn by CSS so page text no longer holds 0123456789 per digit; 3 render tests pass. No screen reader pass, no before/after screenshots yet | rework/phase0-evidence-gate | | |
| P1-MUS-07..10, P0-OPS-02/03, P0-SEC-01..03, P0-BIZ-01, Phases 3-7 | NOT STARTED | | | |

## How to run
- Evidence check: npm run rework:verify
- Real screenshots of a running app: node scripts/rework/capture.mjs <TASK-ID> <before|after|states> <path> (see the script header)
- End-to-end on a clean production build of the committed HEAD: scripts/rework/e2e-prod.sh e2e/rework/<spec> --project=desktop --project=mobile --project=narrow
- Fake signed-in student for local testing (throwaway DB only, refuses anything else): scripts/rework/test-session.mjs
- Why a clean checkout: the project sits in the iCloud-synced Desktop folder. A dev server there is very slow and Finder creates "name 2" duplicates that break tsc, so tests run against a production build kept in /private/tmp.

Note: P2-MKT-03 (relabel the See-it-work scenes) no longer applies: that component was removed in the homepage redesign since the spec snapshot.
Note: under heavy machine load (load average 100+, seen several times) some existing tests time out (classesInWindow, adminPause, backup). Each passed when re-run alone.
