# 0002 — Keeping Configuration organised as it grows

> **Superseded by simplification plan step 5** (`docs/notes/plans/simplification-plan.md`) and ADR 0043 (`docs/notes/architecture/0043-starter-packs-getting-started-checklist-and-the-two-person-switch.md`). Settings is now six sections from one table (`SETTINGS_SECTIONS` in `src/lib/nav.ts`); the 24-section rail below is retired. Kept for the history of the decision.

Status: ruled 2026-10-08 (founder request; product-owner ruling with four binding
amendments). This text is the proposal as corrected by that ruling. The two corrections
that changed the proposal's text: Routing sheets sit in Records, giving Contracts 2
sections and Records 6; and the groups are named by stage, following the main-navigation
modules, rather than reusing its words. Labels are unchanged and the pinned Changes item
ships without a count, as set out below. The shipped rail
is `CONFIG_PINNED` and `CONFIG_SECTIONS` in `src/lib/nav.ts`, guarded by
`src/components/shell/config-nav.test.ts`.

The Configuration rail has 24 sections. They sit in four groups inherited from the
prototype, and the groups no longer say anything. "Money and authority" holds 10 of the
24, mixing requisition, sourcing, award and contract settings. The three newest items
(Sign-in accounts, Sign-in settings, Changes awaiting a second person) fall off the
bottom of the screen. More sections are coming. This note sets the grouping and order,
what sits at the top, where `/configuration` lands, and a rule that decides where every
future section goes.

The scope is limited because the sign-in programme is editing the same tree. Every URL
stays the same, and every page's content stays the same. Only the rail, the landing
redirect, the breadcrumbs and their tests change.

## Who is doing this, how often

All of this is ASSUMED. Nothing in the repo states who configures what.

- **The system administrator** sets up the organisation once. After that they come back
  often for **Users & roles** and **Sign-in accounts** (new staff, reset codes), and
  whenever a change is waiting for a second person.
- **The procurement policy owner** comes back occasionally: a new approval-matrix
  revision, a new evaluation model, next year's holiday calendar. They know *what* they
  want to change ("the closing rules") but not which screen the prototype filed it under.
- **The records officer** uses Documents (files, legal holds), Numbering and the Audit
  trail.
- **A finance or budget officer** uses Budget for yearly allocations.

For nearly everyone the job is: *"I know the rule I want to change. Get me to it without
reading 24 labels."* For the administrator there is a second job: *"Is anything waiting on
me?"*

## What goes wrong today

1. **The groups do not predict their contents.** Nobody would look for Post-award
   controls under "Money and authority", or for Supplier register under "System".
2. **There is no rule for new sections**, so each one lands wherever its builder chose.
   The sign-in items were added at the bottom of "System".
3. **The items people use most are hidden.** Sign-in accounts and Changes awaiting a
   second person are the most frequent visits and sit below the fold. When you land on
   Changes, the item that is lit up is not on screen.
4. **Long labels are cut off.** Rail labels `truncate`, so "Changes awaiting a second
   person" is clipped.
5. **The landing page is arbitrary.** `/configuration` redirects to Approval matrix, a
   policy-owner screen, and not to the organisation the whole area hangs from.
6. **There are two sources of truth.** The breadcrumb tables in `topbar.tsx` restate
   every rail label by hand. `CONFIG_SECTIONS[].description` is never shown and has
   already drifted from the pages.

## Recommendation: group by where the setting acts, mirroring the main navigation

The main navigation is already grouped "by where a matter is in its life" (founder,
2026-10-04, comment in `src/lib/nav.ts`). Configuration follows the same order. The
groups are named by stage, following the main navigation's modules, and do not copy its
words one for one. Each group of settings sits under the name of the part of the product
it changes. Someone who
knows Committee sittings is under *Governance* then finds Committees under *Governance*.
Someone who knows Suppliers is under *Records* finds Supplier register there.

### The rail, top to bottom

**Pinned items (no group header):**

| Item | URL | Why it is pinned |
|---|---|---|
| Organisation | /configuration/organisation | Everything else hangs from it. It is the landing page. |
| Changes awaiting a second person | /configuration/changes | This is "what is waiting on me". It carries the viewer's count (see below). |

**Groups:**

| Group | Sections, in this order | Follows main-nav module |
|---|---|---|
| **People and access** | Users & roles · Sign-in accounts · Sign-in settings | (who someone is, how they sign in) |
| **Governance** | Approval matrix · Committees | Governance (Committee sittings) |
| **Across every stage** | Reference data · Notifications | (more than one module) |
| **Requisitions** | Requisition controls · Budget | Procurement › Requisitions |
| **Sourcing and award** | Scope and estimate · Tender documents · Invitation controls · Evaluation models · Award controls | Procurement › Sourcing, Awards |
| **Contracts** | Contract controls · Post-award controls | Contracts (Contracts, Securities) |
| **Records** | Supplier register · Documents · Templates · Routing sheets · Numbering · Audit trail | Records (Suppliers, Documents) |

That places all 24 sections. The largest group has 6 items (Records). No group has only one.

**Routing sheets sit in Records, not Contracts** (ruling, 2026-10-08). The Documents
register has a Routing sheets tab, and awards use them as well, so they are not only a
contract setting. Placing them under Contracts would also break rule 3 below, which
sends a section to a module's group only when it changes that one module's screens.

**Why this order.** Top to bottom follows the order a new customer sets things up. The
organisation comes first. Then come people and offices, because the approval matrix and
committees name offices. Then authority. Then Reference data, because many empty states
already say "Add them under Reference data" and it has to exist before scope, evaluation
or requisitions can be set. Then the stages of a matter in their order. Records comes
last. Within a group, sections follow the order they act in a matter: scope is set
before the tender pack, the pack before the invitation, the invitation before
evaluation, evaluation before the award.

People and access sits high even though most of it is set up once. It is the
administrator's most frequent visit (accounts), and it must be done before anyone else
can sign in to do the rest.

### Labels: rename nothing now

I checked whether any label is unclear enough to rename. Almost every one is quoted by
name in page copy and validation messages: "Add one under Users & roles first", "Set
that on the route under Reference data", "decided under Changes awaiting a second
person", "Requisition controls' formats", among others.
These texts are page content, and page content is frozen while the
sign-in programme runs. A rename in the rail alone would leave the product telling
people to look under a name that no longer exists. That breaks "the system explains
itself", which matters more than any rename would gain.

So **every label stays exactly as it is.** The fixes that do not involve renaming:

- **Long labels wrap to two lines instead of being cut off.** Change `truncate` to
  `line-clamp-2` in the shared rail item, and align the count badge to the first line.
  Main-nav labels are short, so they are unaffected.
- **Renames come later, as one change with the copy.** After Phase 5, a rename can be
  made in one change that updates the rail, the breadcrumb and every sentence quoting
  the old name. Candidates for that later pass:
  - "Users & roles" to "People and roles", to separate *people* from *sign-in accounts*.
  - "Reference data" to "Shared lists".
  - The five "… controls" labels, if users find "controls" opaque in testing.

### Landing on Organisation

`src/app/configuration/page.tsx` stays a page, because the crumbs test needs the
"Configuration" crumb to resolve to a `page.tsx`. It keeps `await requireStaff()` as
its first awaited call, then redirects to `/configuration/organisation`. That page opens
on its Details tab by default.

There is no hub page. The prototype-style card grid (Coupa and Ariba's "Setup" page)
would repeat the rail, would need the descriptions that have already drifted, and adds
a click to every visit. The rail is the index.

The text-snapshot entry for `/configuration` will now show Organisation instead of
Approval matrix. That change is expected, not a regression.

### The count on "Changes awaiting a second person"

- **No switch turns the two-person rule on or off.** It applies to particular kinds of
  change (permission grants, making an administrator, sign-in settings, issuing the
  approval matrix). So the item is **always pinned, for everyone**. This matches how
  Sign-in accounts and Sign-in settings already behave: the page refuses on its own and
  says who can act.
- **The count is the viewer's own "waiting for you" number.** It is the same number as
  the "Waiting for you" tile on that page. It is **never an organisation-wide count**:
  that would tell people who cannot decide that changes exist, which the page avoids on
  purpose. When the count is zero, no badge shows. If the count fails to load, no badge
  shows; a failure never shows as "0".
- **The count is wired later.** The sidebar already shows a badge from
  `counts["/configuration/changes"]`, so it needs no rail change. But `loadShell`
  (`src/lib/shell.ts`) does not know who is signed in, and this builder may not change
  it. **Ship the pinned item now without a count.** The sign-in workflow adds the count
  when `loadShell` receives the actor. It must use the same cut as `loadChangesView`.

### Not collapsible

Groups stay open and are not collapsible. Staff need density, and a person looking for
"holiday calendars" scans the words. Collapsed groups make them guess which header hides
the word first. Collapsing would also need client-side state that the rail does not
have, and that state would make the rail look different for each person.

The real problem is the active item sitting off-screen. Fix it directly: **when the
rail renders, scroll the rail's own container to the active item**. Set the container's `scrollTop` rather than calling `scrollIntoView`, which would also scroll the page. The rail is already a client component.
The pinned items keep the frequent destinations near the top regardless.

### The rule for where a new section goes

The rule goes in a comment above `CONFIG_SECTIONS`. Take the first line that applies:

1. **It changes who someone is or how they sign in** → People and access.
2. **It changes who may decide, or how a body decides** → Governance.
3. **It changes the screens of one main-nav module** → that module's group.
   Requisitions → Requisitions. Sourcing or Awards → Sourcing and award. Contracts or
   Securities → Contracts. Suppliers or Documents → Records. For example, a future
   "Securities controls" goes in Contracts.
4. **It changes the paper the portal issues or keeps** (numbers, templates, retention,
   audit) → Records.
5. **It changes two or more modules equally** → Across every stage.

Further rules:

- **Group size.** Never create a group for one section. Never add an "Other", "General"
  or "Settings" group. When a group passes **seven items**, split it along main-nav
  module lines (for example, "Sourcing and award" becomes "Sourcing" and "Award").
- **Rail size.** When the rail passes about 40 items, add a filter field at the top of
  the rail, the pattern the large suites use. Do not collapse groups.
- **Labels.** A new label starts with its module's word where it would otherwise be
  ambiguous ("Securities controls", not "Controls"). It must read on its own in a
  breadcrumb. It is short enough to fit on two lines. It never contains a code.
- **Tabs.** Do not add rail items that point at a `?tab=` inside another section. The
  active state matches on the path, so two items would light up at once. A tab is found
  through its section.

## What the builder changes (allowed paths only)

1. **`src/lib/nav.ts`**
   - Add `CONFIG_PINNED` (Organisation, Changes).
   - Rebuild `CONFIG_SECTIONS` in the groups and order above.
   - Type the group as a fixed union, so adding a group is a deliberate edit and not a
     new string.
   - **Delete `description`.** Nothing reads it, and it has drifted from the pages.
   - Add the placement rule as the comment.
2. **`src/components/shell/sidebar.tsx`**
   - Render the pinned items above the first group, with no header and a little space
     below.
   - Change `truncate` to `line-clamp-2` on rail labels.
   - Scroll the active item into view.
   - Matching stays by path prefix, so detail pages light up their parent section.
3. **`src/components/shell/topbar.tsx`**
   - Derive the Configuration section crumb from `CONFIG_PINNED` and `CONFIG_SECTIONS`,
     so the rail and the breadcrumb cannot split.
   - Keep the position-dependent words as they are: `committees`, `suppliers` and
     `evaluation` under Configuration, and "Evaluation model" for the detail page.
4. **`src/app/configuration/page.tsx`**: redirect to `/configuration/organisation`,
   with `requireStaff` first.
5. **`src/app/configuration/layout.tsx`**: no change. It loads no data, so the
   auth-reach rule does not apply.
6. **A new test next to the shell** (for example `src/components/shell/config-nav.test.ts`):
   - Every rail href resolves to a `page.tsx`.
   - Every top-level `src/app/configuration/*/page.tsx` has exactly one rail entry, so a
     new section cannot ship without a place.
   - Every rail label equals its crumb label.
   - No group has fewer than 2 or more than 7 items.
   - Hrefs are unique.

   This test is what keeps Configuration organised. Without it, the rule above is only
   advice.

## States and edge cases

| Situation | What the person sees |
|---|---|
| Clicks Configuration in the main nav | Organisation › Details. Organisation is lit at the top of the rail. |
| On a detail page (a committee, an evaluation model, a template, a routing-sheet type) | The parent section stays lit. The crumb reads Configuration › Committees › Tender Board. |
| Deep link to a tab (`/configuration/users?tab=permissions`) | Users & roles is lit, and the tab is open. |
| The active item is below the fold (Records, Contracts) | The rail scrolls it into view when the page loads. |
| The viewer lacks the permission for a section (Sign-in accounts) | The item is visible. The page refuses and says which permission is needed. The rail is not filtered by permission (see below). |
| Nothing is waiting for the viewer | "Changes awaiting a second person" shows no badge. |
| Something is waiting (once the count is wired) | A count badge shows on the pinned item. It is the viewer's own count, never the organisation's. |
| The count fails to load | No badge. Never "0" shown in place of an error. |
| A section is not built yet | The existing `built: false` "soon" treatment applies. |
| A mistyped `/configuration/foo` | The standard not-found page, inside the Configuration rail. |
| A future section added without a rail entry | The new test fails the build. |

**Why the rail is not filtered by permission.** Today the shell does not know who is
signed in. Even once it does, keep every item visible. When an administrator says "it is
under Sign-in settings", a colleague without the permission should still find it and be
told who can change it. Hiding items makes the rail differ from person to person, and
that kind of instruction stops working.

## Patterns drawn on

- **GitHub repository settings.** A grouped left rail with "General" first and the
  landing page on it. The groups are named for what they act on ("Access", "Code and
  automation", "Security"). I am borrowing the pinned General-first landing and the
  "named by what it acts on" grouping.
- **Stripe settings.** Settings are grouped by the product area they change, following
  the product's own navigation. This is the reason the configuration groups are named by
  stage, following the main-navigation modules.
- **Linear-style workspace settings.** A short, flat rail that is scanned rather than
  expanded, with the most frequent administrative item near the top. I am
  borrowing the decision not to collapse.
- **Coupa and Ariba administration.** These are card hubs with a search over hundreds of
  setup tasks. The hub is right at their scale and wrong at 24 items, which is why there
  is no hub here. Their search is the next step when the rail reaches about 40 items.

## Alternative rejected: group by owner

The alternative groups sections by who owns them: "Procurement policy" (approval matrix,
committees, sourcing and award controls), "Records" (documents, numbering, templates,
audit), and "System administration" (users, accounts, sign-in, notifications,
organisation). It looks tidy, and I rejected it for four reasons:

- **The owners are guesses.** Nothing in the repo states them. Every owner in the map
  above is ASSUMED.
- **It ships one customer's division of labour as the product's structure.** This is a
  resellable product. In one customer the legal office owns contract controls, in
  another procurement does, and finance may own budget or may not appear at all. This
  is the same mistake AGENTS.md warns about with thresholds, applied to navigation.
- **Sections have more than one owner.** Users & roles is the administrator's for people
  and the policy owner's for offices and delegation. Templates belongs to records and
  policy. Shared sections would have no single home, and the placement rule could not
  be followed.
- **It answers the wrong question.** A person looking for "closing rules" knows the
  *stage* the rule acts in. They do not think of themselves as the rule's owner. Once
  sign-in exists, permissions will say what each person can do, without the rail
  restating it.

## Not to build

- **No hub page** at `/configuration` (see above).
- **No collapsible groups.**
- **No rail shortcuts into tabs** such as "Permissions" or "Delegation".
- **No organisation-wide pending count.**
- **No renames in this change.**

## Findability gaps grouping cannot fix (for later, with page content)

- **The sign-in page's words and picture live under Organisation › Details.** An
  administrator will look under Sign-in settings first. Once Phase 5 is done, Sign-in
  settings should carry a one-line pointer: "The sign-in page's wording and picture are
  set on Organisation › Details."
- **Holiday calendars are under Invitation controls.** That is correct (they set closing
  dates) but not guessable. They are a candidate for a pointer from Across every stage
  if testing shows people looking there.
- **Budget's allocations and commitment register are day-to-day finance work, not
  configuration.** If the budget officer turns out to be a daily user, they should move
  into the main navigation. That is a separate decision, outside this change.

## Test with real users before committing

Run a **tree test** (labels and groups only, no screens) with about five staff: two
procurement or policy people, one administrator and one records person. Compare today's
rail with the proposed one on the same eight tasks:

1. "Change how long a tender must be advertised."
2. "Add next year's public holidays."
3. "Give a new officer the right to approve up to RM 500,000."
4. "Let someone act for a section head on leave."
5. "Change the picture on the sign-in page."
6. "Change the letter sent to the winning bidder."
7. "Put a hold on a contract's files for litigation."
8. "See whether a permission change is waiting for you."

Measure first-click success and time. Watch tasks 2 and 5: these are the known
findability gaps, and they show whether a pointer or a move is needed. If "Across every
stage" draws wrong first clicks for task 1 or 6, the label is too vague. In that case,
"Lists and notices" is the fallback.
