# Screen 1: Top bar (measured at 1024 and 390, dark)

| Control | Before | Fix | Laws | Motion |
|---|---|---|---|---|
| Sidebar toggle (lg+) | 32x32, radius 12, flat ghost | 36 pill, raised like its siblings, `tap` | Fitts, Jakob | rule 4 press |
| Streak badge | 30 high, no `tap`, no hover or pressed shadow | 36 high, pill, `tap`, hover/pressed shadows | Fitts, Aesthetic-Usability | rule 4 |
| Credits badge | 28 high | 36 high, `py-0`, same padding as siblings | Fitts | rule 4 (tooltip already uses `pop`: rules 10, 11, 12, 15) |
| Ask AI | 95x36 pill | left alone (already matches) | | rule 4 already via `press` |
| Search | 142x36 pill | `press` added, `transition` dropped so `press` owns the transition | Jakob | rule 4 |
| Theme switch | 36 pill | `press`; icon swap (rule 18) is n/a: the icon renders after mount, swapping Sun/Moon is a follow-up | | rule 4; 18 deferred |
| Bell | 36, radius 12 (the odd one out) | pill | Jakob | rule 4 |
| Admin alerts, Student notes, Attendance (owner/admin) | 36, radius 12 | pill, `press` | Jakob | rule 4 |
| Admin link, Friends link, Profile picture | 36 pill | `press` | | rule 4 |
| Breadcrumb | 18 high text links, lg+ only | left alone: pointer-only trail, never shown on touch widths | | n/a (no motion) |
| Logo (phone) | 40x40 | left alone | | n/a |

Icon sizes were already 16 (with a label) and 18 (icon only). Needs your decision: Sun/Moon icon swap on the theme switch (rule 18), and whether Ask AI's orange ring breaks "accent only for the main action". Neither was changed.
