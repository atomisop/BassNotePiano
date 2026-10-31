# Bass Note Piano against the Laws of UX

Written 2026-10-30. Nothing here is built yet: the owner approves each phase first.

The "Laws of UX" are a well-known set of rules collected by Jon Yablonski (lawsofux.com), drawn from psychology research. The one
from the talk is **Jakob's Law**: people spend most of their time in other apps (YouTube, Instagram, TikTok, Google, Spotify,
Duolingo), so they expect ours to work the same way. "Hooke's law" is probably **Hick's Law** (more choices = slower decisions).

## The laws, in plain words, and what each means for this app

| Law | What it says | What it means here |
| --- | --- | --- |
| **Jakob's Law** | People expect your app to work like the apps they already use. | Back button top left on every inner screen; dark mode in Settings; tabs at the bottom; search where people look for it; the profile picture opens your account. |
| **Hick's Law** | More choices = slower decisions. | Few options per screen; one main button. The admin menu (6 groups) is good; the student top bar has too many small icons on a phone. |
| **Fitts's Law** | Big, close targets are faster to hit. | Main buttons wide and near the thumb; nothing important in a corner; tap targets 44px. |
| **Miller's Law** | People hold about 7 things in mind at once. | Lists of choices stay short, longer ones are grouped. |
| **Chunking** | Information in small groups is easier to take in. | Group settings, admin pages and Home rows under clear headings (already started). |
| **Cognitive Load** | Every extra thing to read or figure out costs effort. | One way to do each thing; no duplicate buttons for the same place. |
| **Working Memory** | People should not have to remember things between screens. | Show the price, the time, the person right where the decision happens. |
| **Choice Overload** | Too many options make people freeze. | Plan screen: one recommended plan marked clearly. |
| **Mental Model** | People act on what they believe the app does. | Names match what things are ("Lessons" everywhere, not "Online Lessons", "Live Lessons" and "Book a class" for one place). |
| **Law of Similarity** | Things that look alike are taken to work alike. | All buttons of one kind look the same; links look like links; badges never look like buttons. |
| **Law of Proximity** | Things close together are seen as related. | A label sits next to what it labels; actions sit next to what they act on. |
| **Law of Common Region** | Things inside one box belong together. | Grouped panels for related rows (done on Home and Overview). |
| **Law of Uniform Connectedness** | Connected things (lines, same background) are seen as one. | Tabs and their page share one surface. |
| **Law of Prägnanz** | People see the simplest form. | Plain shapes, no decoration that has to be decoded. |
| **Von Restorff Effect** | The one thing that is different gets noticed. | One orange main button per screen; everything else quiet. |
| **Serial Position Effect** | People remember the first and last items best. | Most important dock items at the ends (Home first, Settings last). |
| **Aesthetic-Usability Effect** | Good-looking things feel easier to use. | Keep the polish, but never at the cost of clarity. |
| **Doherty Threshold** | Answers within 0.4 seconds keep people engaged. | Instant feedback on every tap (pressed state, skeletons, optimistic updates). |
| **Goal-Gradient Effect** | People push harder as they near the goal. | Progress bars on practice, scales and sign-up steps (Duolingo's whole style). |
| **Zeigarnik Effect** | Unfinished tasks stick in the mind. | "Continue where you left off" and the Get started checklist. |
| **Peak-End Rule** | People judge an experience by its best moment and its end. | Celebrate finishing practice, a scale, a payment; end every flow on a clear "done". |
| **Flow** | Stay in the task without interruptions. | Fewer pop-ups over the page (phone, Discord and practice banners, the install prompt). |
| **Selective Attention** | People ignore what looks like ads or noise. | Banners that look like notifications get dismissed without reading. |
| **Tesler's Law** | Some complexity cannot be removed, only moved; the app should carry it. | Work out time zones, prices and credits for the person; never make them calculate. |
| **Occam's Razor** | The simplest design that works is best. | Remove screens and options nobody needs. |
| **Pareto Principle** | 80% of use comes from 20% of features. | Practice, booking and paying get the best spots; the rest is one tap further. |
| **Paradox of the Active User** | People never read instructions; they start tapping. | Screens must explain themselves; tours are a backup, not the way in. |
| **Postel's Law** | Accept messy input, give clean output. | Phone numbers, names and emails in any format, cleaned up for them. |
| **Parkinson's Law** | Tasks take as long as the time allowed. | Short forms; autofill; nothing typed twice. |

## What the audit found (most important first)

1. **People can get stuck (Jakob).** 29 inner screens have no Back button. Top tabs (Home, Roadmap, Lessons, Messages, Settings,
   and Overview for the owner) correctly have none, like Instagram. These need one:
   - Students: Practice, Friends, Leaderboard, Streak, Mail, Parent mode.
   - Admin (on a phone, Back to Overview): Payments, Plans, Pricing, Accounts, Applicants, Contacts, Staff, Today, Schedule,
     Lessons, Discord, Support Chat, Messages, Sent, Settings, Security, Activity, Roadmaps.
   - Already have one: a scale, a mail message, billing, profile, a student's page, a contact, a support thread, a parent's child.
2. **One place, three names (Mental Model).** The dock and sidebar say "Online Lessons", the page says "Live Lessons" and
   "Book a class". Pick one: **Lessons**.
3. **The phone top bar is crowded (Hick, Similarity).** Logo, streak badge, credit badge, Ask AI and the picture, with small
   icon-only badges that look like buttons but do different things. Instagram and YouTube keep 2 or 3 things up there.
4. **Too many pop-ups (Flow, Selective Attention).** Phone number, Discord and practice banners, the install prompt, the tour
   and "what's new" all compete. Most apps ask for missing details inside Settings or at the moment they are needed.
5. **Names on admin tabs.** Setup > Security now also holds Automatic tasks and Page views; "System" would describe it better.
6. **Squeezed rows.** On a phone, People > Accounts squeezes a name to one letter when the row has a "Complimentary" badge.
7. **Side scrolling (Spotify, Duolingo).** Not used anywhere yet. Good places for it: Home's "Studio" (leaderboard, friends,
   badges) as a shelf of cards; the Roadmap's scales as a shelf per level; admin's next 7 days as swipeable days.
   **The clash you mentioned is real:** on iPhone Safari and Chrome, swiping from the very edge goes back a page. Spotify and
   Duolingo avoid it by starting the shelf a little in from the edge and keeping the swipe inside the shelf
   (`overscroll-behavior-x: contain`), so a swipe on a shelf never turns into "back". I would do the same and keep shelves to
   2 or 3 places, never a whole page that pages sideways.

## The plan (each phase shown to you before the next)

1. **Back buttons and names.** A Back button on all 29 screens above (it returns to the page you came from); "Lessons"
   everywhere; Setup > Security renamed "System" if you agree.
2. **Side-scroll shelves.** Home's Studio shelf and the Roadmap shelves, built the Spotify way, so you can see how it feels.
3. **Phone top bar and pop-ups.** Fewer things in the top bar; missing details asked for in Settings and at the moment they are
   needed, not as banners.
4. **A full pass, law by law.** Every screen checked against the table above: one main button, grouped content, progress shown,
   clear endings, consistent buttons and colors. Screenshots before and after for each.
