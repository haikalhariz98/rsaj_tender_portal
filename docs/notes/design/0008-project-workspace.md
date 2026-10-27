# 0008 — The project workspace: work items, timeline and budget (Phases 3 and 4)

Status: proposal, written 2026-10-27 by the UX lead for the product owner. It is a design for building from, not a build plan; the
architect's plan for each stage follows it. Nothing here edits ADR 0042, ADR 0047 or the Phase 1 plan; where this note lifts an
earlier ruling it says so (§4.10).

**The founder's words (binding).**
- "my vision in project management is more like a Jira, clickup or devops, with budget, timelines, task, payment milestone,
  exchange documents, all other RSAJ requirements and standard project capabilities".
- "for phase 3 and 4, I want the UI to be like Saas system like, jira clikcup, procuro [Procore] or other to manage it, it should
  be easy to use".
- Simple, minimal words (0005), explanations behind info popovers, English only, desktop only, dropdowns over typing.

**Inputs.** `docs/notes/plans/roadmap-2026-10-27.md` (decisions 5, 6, 7); the requirement document's PS-01..06, EX-01..08,
PC-01..09, CC-01..07 and RP-02; `closeout-plan.md` §7 (the defect seam) and ADR 0047; `sukuk-core-plan.md` FS-8 to FS-10 (the
money readings); `project-workspace-simple-plan.md` and ADR 0042 (documents); `case-tabs.ts`; the case page; the contractor's
portal.

Words in wireframes: `{org}` is the organisation's configured name, never "RSAJ". `{contractor}` is the awardee's name.

---

## 1. The short answer

1. **One new tab, Work, holds every work item.** It is a list or a board on the same filter, with an item side panel. It is
   case-level, like History: it shows in the Project and Close-out strips.
2. **Phases 2 to 4 together add one tab to the Project stage.**
   - Phase 2's "Time" becomes **Timeline**: the Gantt, the programme revisions and extension of time.
   - "Payments" is relabelled **Budget**, with the budget summary on top.
   - "Certificates" folds into **Documents** as a section.
   - The strip becomes Overview · Work · Timeline · Budget · Variations · Site · Documents · Team · History.
3. **Registers stay where they are. The board is a lens.**
   - Variations, extension-of-time claims and certificates keep their own tabs and acts.
   - While they move, they appear on the board as **linked cards**, read-only.
   - Board columns are item statuses, never stage names. The stepper stays the contract's lifecycle.
4. **One status set for every type:** To do, In progress, In review, Done, plus Cancelled.
   - The assignee sends an item for review; the raiser closes it.
   - There is no custom workflow and no per-type status.
5. **Contractors see only shared items.**
   - Some types share by default.
   - On a shared item, staff choose **Reply** (the contractor sees it) or **Internal note** (never sent).
   - Work given to the contractor is given to the company, not to a named contact. Contact names are SULIT to staff (§4.5).
6. **My work** joins the sidebar, next to My approvals. It shows the items on you across every project, grouped by when they are
   due. Alerts become inbox notices. The contractor gets a derived "Waiting for you" list, with no new notice table.
7. **Phase 4.**
   - The programme gains activities with dependencies.
   - Approving a revision freezes it as the baseline.
   - The Gantt is for reading, with light progress edits.
   - Payment milestones exist only where the contract type is paid by milestone.
   - The budget card and the money S-curve sit on Overview, using Phase 1's readings word for word.

---

## 2. Who, how often, and what goes wrong

| Who | How often | What they are trying to finish |
| --- | --- | --- |
| Site engineer ({org}) | All day, several projects | Answer RFIs, issue instructions, record inspections and NCRs, chase defects. Knowing what is late. |
| Project manager ({org}) | Daily scan, weekly review | What is stuck, who owes what, whether the job is behind on time or money. |
| Contract administrator ({org}) | Daily | The formal acts (variations, EOT, certificates). The informal work feeding them must not get lost. |
| Section head / approver | Weekly or less | The project's state on one screen: progress, cost, variations, EOT (RP-02). Rarely touches items. |
| Contractor's site agent | A few times a week, in a site office | What {org} is waiting on from them, what they asked and whether it was answered. Plain words, one next step. |

**What goes wrong today.**
- RFIs, site instructions and NCRs live in WhatsApp threads, emails and an Excel log.
- The portal holds the formal records well: variations, EOT, certificates, the diary. Nothing records the small work around them,
  such as who owes an answer, by when, and whether it was checked.
- When an RFI turns into a site instruction and then a variation, the chain exists only in someone's memory.
- The contractor has no list of what is waiting on them beyond documents.

---

## 3. Navigation

### 3.1 The rule that stops two structures competing

- **Stages say where the contract is.** The stepper is Award, Before signing, Signing, Project, Close-out. It is the legal
  lifecycle and it does not change.
- **Tabs are the tools for that stage.** A tool is a place you work in, not a step of a procedure.
- **The board is a lens, not a lifecycle.**
  - Its columns are the four item statuses. A stage name is never a column.
  - A formal act appears on it only as a linked card whose position is read from the act.
  - It is never moved from the board, except a defect (§4.7).

### 3.2 The Project stage strip

| Today | After Phase 2 (designed) | After 4b (this note) | Change |
| --- | --- | --- | --- |
| Overview | Overview | **Overview** | Gains the stat row, the budget card and the S-curve (§5.7, §7.4). |
| — | — | **Work** | New, case-level (§3.3). |
| — | Time | **Timeline** | Phase 2's Time tab, relabelled in 4a. The Gantt goes on top; the Programme card moves here from Site. |
| Payments | Payments | **Budget** | Label only; the id stays `payments` (precedent: plan step 6 renamed Documents in words only). Budget and Payment milestones go on top as new sections. |
| Variations | Variations | **Variations** | Unchanged. |
| Site | Site | **Site** | Loses the Programme card, which moves to Timeline. Possession, progress records, diary, oversight and records stay. |
| Documents (`submissions`) | same | **Documents** | Gains a Certificates section, the old `documents` tab. |
| Certificates (`documents`) | same | — | Folded into Documents. The old address resolves to the section. |
| Team | Team | **Team** | Gains the Project team card (§4.9). |
| History | History | **History** | Unchanged. |

- **Count.** That is nine tabs including History. Today there are eight, and Phase 2 alone would make nine. All three phases
  together add one.
- **Order.** The order is by how often the tab is opened, so Work sits next to Overview.
- **Old links.** Every old link still resolves through `caseTabToStep`, the existing alias mechanism (F0-5):
  - `?tab=time` → `timeline`;
  - `?tab=documents` → `submissions`, section `certificates`;
  - `?tab=site&section=start` keeps working; the Programme card leaves a one-line "Moved to Timeline" link for one release.
- **Close-out strip (Phase 2):** Completion · Defects · Final account · Closure, then **Work** and History.
- **Award, Before signing, Signing:** unchanged. There is no Work tab before a contract exists.

### 3.3 Work is case-level

- Work is addressed `?tab=work` with no stage, like `?tab=history`.
- It is drawn in the Project and Close-out strips, because defect items live through the defects liability period.
- The stepper keeps the live stage highlighted.
- An item is addressed `?tab=work&item=RFI-12`. Notices, links and the browser's back button all land on the panel open (§5.4).
- There is no separate item page.

### 3.4 The global nav

```
WORK
  Home
  Dashboard
  My approvals      3
  My work                <- new (/my-work); no count badge
  Inbox             5
```

- **No count on My work.** Open items assigned to you never reach zero, and a badge that is always on gets ignored. The Inbox
  carries the unread count, and that is where an item reaches you (§4.8).
- **No "RFIs", "Defects" or "Schedule" menu.** The product is object-centric: you open a project and work inside it. My work is
  the only cross-project view, because "what is on me today" is a question that spans projects.

### 3.5 What becomes an item, what stays a register

Each record already in the product gets one treatment, so no fact has two homes (the close-out plan's warning).

| Record | Treatment | Where |
| --- | --- | --- |
| Variation | Linked card while in progress | Register in Variations |
| EOT claim (Phase 2) | Linked card while in progress | Register in Timeline |
| Certificate in routing (IPC, adjustment, CNC, CPC, CMGD, final) | Linked card from draft to issued | Register in Documents › Certificates and its own page |
| Defect line (`DefectItem`, Phase 2) | **Is** a Defect item's legal line (§4.7) | Close-out › Defects stays the legal schedule |
| Project document (ADR 0042) | Never a card. An item can link one. | Documents |
| Site diary entry | Register. "Raise item" from an entry links back. | Site › Diary |
| Compliance observation (FR-SUP-014) | Register. "Raise item" (an Inspection or a Task) links back. | Site › Oversight |
| Special site meeting (FR-SUP-011), kick-off meeting | Register. "Add action item" links back. | Site, Team |
| Programme direction (FR-SUP-012) | Register. Shown as a marker on the Timeline. | Timeline |
| Early action, premiums, records handover | Register only | Site |

**The gap, named.**
- EX-06 asks for site meetings, minutes and action items. The product holds only the kick-off and the special In Delay meeting.
  There is no record of the routine progress meeting.
- This note does not add one. The routine meeting's minutes are a project document. Action items link to that document ("From:
  Site meeting 7 minutes").
- If real users want attendance and agenda for routine meetings, that is a later record (§14).

---

## 4. The item model

### 4.1 Types: fixed, seven (decision 7)

| Type | Card label | For | Its own fields (fixed) | Shared with the contractor by default | Who may raise |
| --- | --- | --- | --- | --- | --- |
| RFI | RFI | A question needing an answer by a date (EX-03) | **Answer** (a field, not a comment); **Impact**: None, Cost, Time, Cost and time | Yes | Staff, contractor |
| Site instruction | SI | An instruction to the contractor (EX-03) | **Impact** as above; offers "Start a variation" when Cost is picked | Yes | Staff |
| Inspection | Inspection | An inspection or test (EX-05, FR-CMP-005) | **Result**: Not yet, Passed, Failed. Failed reads "NCR" on the card. | Yes | Staff |
| Safety incident | Incident | An incident or near miss (EX-07) | **Severity**: Near miss, First aid, Medical treatment, Lost time, Dangerous occurrence; **Happened on** (day and time) | No | Staff, contractor |
| Action item | Action | An action from a meeting (EX-06) | **From**: a meeting record or a minutes document (dropdown) | If assigned to the contractor | Staff |
| Defect | Defect | A defect or snag (CC-01, CC-02) | **Location**; the legal line once listed (§4.7) | Yes | Staff |
| Task | Task | Anything else | — | No | Staff |

**Every type also has:**
- title and description;
- assignee, due date and priority;
- status;
- an optional **location** (free text with recent values suggested; the one typed field, because locations are the project's own);
- watchers, comments and attachments;
- links: to other items, to a programme activity (Phase 4), to a project document, and to its source record;
- the activity history.

**An NCR is not an eighth type.**
- It is an Inspection whose result is Failed. The list has a view "Non-conformances" (Inspection, Failed).
- The item stays open, assigned to the contractor, until a re-inspection passes and the raiser closes it. That is EX-05's
  "through to close" with no extra state.

### 4.2 Statuses: one set for every type

```
 To do  ──▶  In progress  ──▶  In review  ──▶  Done
   ▲              │                │
   └──────────────┴── returned ◀───┘          Cancelled (from any open status)
```

| Status | Means | Who moves an item into it |
| --- | --- | --- |
| To do | Raised, not started | Anyone who may edit. Also the reopen target. |
| In progress | The assignee is on it | The assignee, or anyone who may edit |
| In review | The assignee says it is finished; the raiser checks | The assignee. An RFI needs its Answer first; a failed Inspection needs its result changed to Passed first. |
| Done | Checked and closed | The **raiser**, or the project lead (§4.9) |
| Cancelled | Not going to happen | The raiser or the lead, **with a reason** (AGENTS.md: a destructive change asks for one) |

- **Returned.** In review back to In progress, with a comment. The assignee is told. This is the "Work not accepted" step of
  Procore's punch workflow, without its other six states (§10).
- **The shortcut.** When the raiser is also the assignee, In review is skipped: Mark done goes straight to Done.
- **Reopen.** Done back to To do, by the raiser or the lead, recorded in the history.
- **Overdue.** Not a status. It is read: due date before the organisation's today, and not Done or Cancelled. Shown as "2 days
  late" in the error tone.
- **The rules are pure.** One function judges a move: (item, actor, to) → faults. The board, the list, the panel and the portal
  all call it. There is no second copy in a component (AGENTS.md rule 3).

### 4.3 Fields, and how each is entered

| Field | Control | Notes |
| --- | --- | --- |
| Type | Select | Picked at creation. Changing it later is allowed while To do, and recorded. |
| Title | Input | Required. The only required field besides type. |
| Description | Textarea | Optional |
| Assignee | Select, searchable: the project team first, then "{contractor}", then everyone else | Optional. Unassigned is a valid state and has its own view. |
| Due date | Date picker, with "Today", "+3 days", "+1 week" quick picks | Optional. Required for RFI and SI (EX-03 "response due dates"), defaulted to +7 days. The default is a column on the organisation, not a literal. |
| Priority | Select: Low, Normal, High, Urgent | Normal by default. Urgent is Phase 2's expedited class (FR-CMP-012). |
| Shared with contractor | Toggle | Per §4.5 |
| Watchers | Avatar stack, "Watch" toggle | Per §4.8 |

### 4.4 Numbers

- Each item gets a number per project and type: **RFI 12**, **SI 3**, **Inspection 7**, **Defect 41**.
- RFIs and instructions are quoted by number in letters, meetings and claims; a log without numbers cannot be referred to.
- This differs from PW-4, which removed numbers from documents. That is why it is open question 1.

### 4.5 Sharing with the contractor (decision 6)

- **The rule.** The contractor sees an item only when it is shared. An item is shared when:
  - it was raised by the contractor;
  - it is assigned to the contractor;
  - its type shares by default (§4.1); or
  - a staff member turns **Shared with contractor** on.
- **Sharing is one-way.** Once shared, an item stays shared. Taking back something the contractor has read leaves them asking
  where it went, and the history would still show it. The toggle is offered as off-to-on only. Before an item is shared, the
  panel shows a quiet "Not shared" chip.
- **Two kinds of comment on a shared item**, borrowed from Jira Service Management's "Reply to customer" and "Add internal note":
  - **Reply** (the default) is seen by the contractor.
  - **Internal note** is drawn on an amber tint with a lock icon and is never sent.
  - The portal's reader leaves internal notes out at the query, not in the component, and a scan test holds that.
  - On an unshared item every comment is internal, so there is no choice to make.
- **What the contractor never sees.**
  - Internal notes.
  - Watchers who are {org} staff.
  - Linked cards of formal acts. Those reach the contractor through their own portal tabs.
  - Links to records not shared with them, which are dropped, not greyed.
  - The history entries of internal notes.
- **Work given to the contractor goes to the company.**
  - The assignee is "{contractor}", not a named contact. Any of the awardee's active portal accounts may act on it (PW-17: every
    active account is on the contractor's side).
  - This follows Aconex, where a mail is outstanding until "they or someone in their organisation responds".
  - The SULIT problem it solves: a portal contact's name is SULIT to staff (6.15 condition 2; `team-read.ts`). A named contractor
    assignee would turn every card, list row, feed line and notice body into a logged SULIT read.
  - So on every staff surface a contractor actor is "{contractor}" with a building avatar: cards, rows, the feed ("{contractor}
    replied"), notice bodies and watchers.
  - The named account is in the audit trail, read through the existing gate.
  - On the portal, the contractor sees its own colleagues' names, because the data is its own.
- **Staff names on the portal.** The contractor sees the staff assignee by name and project role ("Aisyah, Site engineer"). The
  portal already shows the S.O. and representatives by name and office; a site agent needs to know whom to ring.

### 4.6 Formal acts as linked cards

- A linked card is drawn from the act. It has no row of its own in the item tables and is never stored twice.
- **The card.**
  - A chain-link icon and the act's label: "Variation 4", "EOT claim 2", "Interim certificate 7".
  - The act's own state in its own words: "With approver", "Being assessed".
  - Who holds it, as an office or person.
  - Its clock, where the act has one: the certification period (PC-08) or the assessment period. Otherwise no date.
- **The column** comes from a pure mapping of the act's state:

| Act state | Column |
| --- | --- |
| Drafted, being valued or assessed, not yet sent | To do |
| Has a working owner (valuing, assessing) | In progress |
| In approval routing, or waiting on a signature | In review |
| Decided, issued, or withdrawn within the last 14 days | Done |
| Older than that | Not on the board |

- **It cannot be dragged.** A drag snaps back with "Moves when the variation is decided. Open it to act." Opening the card shows
  a short panel with the act's facts and one button, **Open variation**, which goes to the register.
- **Links.** An item can link to an act, and an act can be started from an item: an SI with Impact set to Cost offers "Start a
  variation", which opens the existing variation drawer prefilled and links the two. The item's panel then shows the linked card,
  and the variation's page shows "From SI 3".
- **The toggle.** Linked cards show by default. A toolbar chip, **Contract acts**, hides them for someone who wants only items.

### 4.7 Defects: the Phase 2 seam (closeout-plan §7, ADR 0047)

- A **Defect** item is the collaboration shell. `DefectItem` is the legal line. One line has at most one item.
- **Before practical completion**, a Defect item is a snag with no line. It moves through the four statuses like any item.
- **At CPC raise**, the officer can pick open Defect items from a multi-select. `addCpcDefect` creates their lines and links them.
- **During the defects liability period**, "List as a defect" on an item calls `reportDefect`.
- **Once linked, the column is read from `defectState(events)`.**
  - A drag to Done calls `acceptDefect`; a drag back to In progress calls `returnDefect` with its note.
  - The contractor's "Mark as fixed" calls `reportDefectRectified`, which moves the card to In review.
  - Every refusal of those acts is shown in their own words.
- **Issued certificates are never touched.** `frozenLines` keep what was certified.

### 4.8 Watchers and notices

- **Watchers are added automatically:** the raiser, the assignee, and anyone who comments. The project lead is added on
  contractor-raised items. Anyone can Watch or Unwatch from the panel.
- **Notices are staff `StaffNotice` rows**, new closed kinds, changed together with the CHECK (the
  `20261110000000_staff_notices_…` precedent):

| Kind | To | When |
| --- | --- | --- |
| Assigned to you | The new assignee | On assignment, never to someone assigning themselves |
| Waiting for you to check | The raiser | Moved to In review |
| Sent back to you | The assignee | Returned |
| New reply | Watchers, not the writer | A comment or reply, at most one notice per item per hour per person |
| Due tomorrow / Late | The assignee | Once each, never daily |
| Raised by {contractor} | The assignee, or the lead when none | A contractor raises an item or replies on one |

- **The contractor gets no notice table and no bell** (PW-13 stands). The portal's existing derived "Waiting for you" list
  gains the shared items where:
  - the contractor is the assignee and the item is To do or In progress; or
  - the contractor raised the item and it is In review.
- Email stays parked.

### 4.9 Team roles (PS-02)

- **The Team tab gains a "Project team" card.** It has rows of role and person, with Add, change and remove drawers. Every change
  is audited.
  - **Roles:** Project manager (one), Site engineer, Contract administrator, Consultant (several each).
  - They are fixed product defaults, like types and statuses (decision 7). The four come from PS-02.
  - Whether a customer may rename or add roles is open question 3.
- **A Consultant is a staff-side `Person`** named on the team. There is no third portal.
- **Roles route work and notices. They never carry authority.**
  - The **project lead** is the Project manager, or the S.O. office holder when no Project manager is named. The lead may close
    or cancel any item.
  - **Default assignees:** a contractor-raised RFI goes to the Contract administrator, and a contractor-raised incident to the
    project lead. With the role empty, the item is assigned to nobody and the lead is told.
  - Approval authority for every formal act stays where it is: the S.O. office, delegations and DAL. A role never makes someone
    an approver.
- The contractor's side stays as it is: the awardee's active portal accounts (PW-17), read-only.

### 4.10 Earlier rulings this lifts, and what keeps them

| Ruling | Lifted for work items | Still binding on |
| --- | --- | --- |
| PW-4: no due days, days waiting, overdue or numbers | Items have due dates, "late", and numbers (§4.4, Q1) | Project documents. No overdue, no numbers, no counts. |
| PW-16: no stored staff members or roles | The Project team card (§4.9) | Nothing. Document approval still asks PW-5 authority, not a role. |
| PW-17: no per-contract contractor membership | Not lifted. Items go to the company. | — |
| PW-13: staff inbox only; no supplier notice table | Not lifted. New staff kinds; the contractor's list is derived. | — |

---

## 5. The views

### 5.1 One toolbar for list and board

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Open] [Mine] [Late] [Waiting on {contractor}] [Unassigned] [Non-conformances] [Done]      [List|Board]  (+ New item) │
│ 🔍 Search items     Type ▾   Assignee ▾   Priority ▾   Shared ▾   ☑ Contract acts                  Clear     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Views are fixed chips.** These are DataList's existing `views`, borrowed from Jira's "Only my issues" and "Recently
  updated" quick filters.
- **Filters are dropdowns.** They are DataList's `filters` lifted into a shared toolbar (§8).
- **Filters live in the address.** A combination can be bookmarked or pasted into a chat. This is the saved filter without a
  saved-filter feature (§12).
- **List and Board share the toolbar and the address.** Switching keeps the filter (ClickUp's views over one filter).
- The last view used is remembered per person, per browser.
- **The one primary action is New item.**

### 5.2 List (the default view)

```
 Work                                                                                                        
 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Item                                         Type        Status          Assignee           Due          Pri  
 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  + Add item…  [RFI ▾]  Title, then Enter                                                                      
  RFI 12  Rebar spacing at grid C4             RFI         In progress ▾   🏢 {contractor} ▾   2 days late  ▲   
  SI 3    Relocate manhole MH-07               SI          To do ▾         🏢 {contractor} ▾   5 Nov            
  Insp 7  Slab pour L2 (NCR)                   Inspection  In progress ▾   Aisyah ▾            8 Nov        ▲▲  
  ⛓ Variation 4  Additional drainage           Variation   With approver   Tender Board        —                
  Act 9   Submit revised traffic plan          Action      In review ▾     Hafiz ▾             Today            
  Task 2  Chase as-built drawings              Task        To do ▾         —                   —                
 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  1–50 of 63                                                                                     Next ›        
```

- **Rows are `DataList` in server mode** (paged, sorted and searched on the server).
- **Status, assignee, due and priority cells are inline selects.** This is a new DataList cell kind, `select` (§8).
- **The quick-add row** sits on top: a type dropdown, a title, then Enter. The item is created and its panel opens for the rest.
  The type remembers the last one used.
- **Default sort:** late first, then by due date, then by priority. Done and Cancelled are in the Done view only.
- **Clicking a row**, or pressing Enter on it, opens the side panel. The list stays visible and the row stays highlighted.
- **Selection** takes the existing row checkboxes. Bulk actions are **Assign**, **Due date** and **Status**, each through the
  same pure move rules. A refused row is listed by number, never silently skipped.
- **Linked cards** show as rows with the chain icon, and their cells are not editable.

### 5.3 Board

```
 To do  6                     In progress  9                In review  3                  Done  12 (last 14 days)
 ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐
 │ + Add item               │ │ + Add item               │ │                          │ │                          │
 │┌────────────────────────┐│ │┌────────────────────────┐│ │┌────────────────────────┐│ │┌────────────────────────┐│
 ││ SI 3            ⇄      ││ ││ RFI 12   ▲       ⇄     ││ ││ Act 9                  ││ ││ Defect 41    ⇄         ││
 ││ Relocate manhole MH-07 ││ ││ Rebar spacing at C4    ││ ││ Submit revised traffic ││ ││ Cracked tile, Block B  ││
 ││ 🏢 5 Nov               ││ ││ 🏢 2 days late         ││ ││ (H) Today              ││ ││ (A) 1 Nov              ││
 │└────────────────────────┘│ │└────────────────────────┘│ │└────────────────────────┘│ │└────────────────────────┘│
 │┌────────────────────────┐│ │┌────────────────────────┐│ │┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐│ │                          │
 ││ Task 2                 ││ ││ Insp 7  NCR  ▲▲        ││ │ ⛓ Variation 4          │ │                          │
 ││ Chase as-built drgs    ││ ││ Slab pour L2           ││ ││ With approver          ││ │  Older: in the list ›    │
 ││ —                      ││ ││ (A) 8 Nov              ││ │  Tender Board           │ │                          │
 │└────────────────────────┘│ │└────────────────────────┘│ │└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘│ │                          │
 └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘
```

- **A card shows:** number, title on at most two lines, and assignee avatar (a building for {contractor}). It also shows the due
  date, red when late, and the priority marker for High (▲) and Urgent (▲▲). A ⇄ shows when the item is shared, and "NCR" on a
  failed Inspection.
- **No counts on cards, no tags, no progress bars.** The minimum the scan needs (0005).
- **Linked cards** have a dashed border and the chain icon, and no drag handle.
- **Drag.**
  - A drag calls the same move act as the status select.
  - A refused drop snaps back and shows the refusal as a toast in plain words: "Only Hafiz, who raised it, or the project
    manager can mark this done."
  - The drop is optimistic and is reverted on refusal.
- **Keyboard.** The board must not need a mouse: with a card focused, `S` opens its status menu, and arrow keys move focus
  across columns. This is required for accessibility, not a nicety.
- **Within a column,** cards sort the same way as the list. There is no manual ordering (no rank field; §12).
- **Done** shows the last 14 days, then "Older: in the list ›".
- **A column over 50 cards** shows 50 and "Show 50 more".
- **Quick add** at the top of a column creates an item in that status. To do and In progress only.

### 5.4 The item side panel

```
                                                   ┌───────────────────────────────────────────────────────────────┐
                                                   │ RFI 12 · Rebar spacing at grid C4                     ⋯   ✕  │
                                                   │ [ In progress ▾ ]   ⇄ Shared   2 days late         (Send for review) │
                                                   │───────────────────────────────────────────────────────────────│
                                                   │ Assignee   🏢 {contractor}        Priority  High ▾            │
                                                   │ Due        25 Oct ▾               Raised    Hafiz, 18 Oct     │
                                                   │ Location   Grid C4, Level 2       Watchers  (H)(A)🏢  Watch   │
                                                   │───────────────────────────────────────────────────────────────│
                                                   │ Drawing S-201 shows 150 c/c; BQ item 3.2.4 says 200 c/c.      │
                                                   │ Which governs?                                                │
                                                   │                                                               │
                                                   │ ANSWER                                                        │
                                                   │ ┌───────────────────────────────────────────────────────────┐ │
                                                   │ │ Not answered yet                                           │ │
                                                   │ └───────────────────────────────────────────────────────────┘ │
                                                   │ Impact  None ▾                                                │
                                                   │                                                               │
                                                   │ LINKED   ⛓ SI 3 · Relocate manhole    📄 Drawing S-201 rev C   │
                                                   │ FILES    📎 photo-c4.jpg  📎 markup.pdf                + Add  │
                                                   │───────────────────────────────────────────────────────────────│
                                                   │ Activity                               [All | Comments]       │
                                                   │ (H) Hafiz raised this · 18 Oct                                │
                                                   │ (H) Hafiz assigned {contractor} · 18 Oct                      │
                                                   │ 🏢 {contractor} replied · 20 Oct                               │
                                                   │    "Checking with our engineer."                               │
                                                   │ 🔒 Aisyah · internal note · 21 Oct                             │
                                                   │    "Designer says 150 governs."                                │
                                                   │───────────────────────────────────────────────────────────────│
                                                   │ [ Reply | Internal note ]                                      │
                                                   │ ┌───────────────────────────────────────────────────────────┐ │
                                                   │ │ Write a reply…                                     📎     │ │
                                                   │ └───────────────────────────────────────────────────────────┘ │
                                                   │                                              (Send)           │
                                                   └───────────────────────────────────────────────────────────────┘
```

- **Non-modal, at the right, `lg` width.** There is no scrim.
  - The list or board stays live beside it; `J` and `K` step to the next and previous item.
  - This is Linear's peek and Jira's issue side view, instead of a page hop.
  - It is a variant of the existing drawer shell (§8), so header, width and close behaviour match every other drawer.
- **The address holds the item**, so back, refresh and a pasted link all reopen it.
- **One primary action, derived from the state and the reader:**

| Reader and state | Primary | In the ⋯ menu |
| --- | --- | --- |
| Assignee, To do | Start | Send for review, Reassign, Cancel |
| Assignee, In progress | Send for review | Reassign, Cancel |
| Raiser or lead, In review | Mark done | Send back (asks a comment), Cancel |
| Raiser or lead, Done | — | Reopen |
| Someone else | — (fields only) | Watch |

- **Fields edit inline.** A change saves on pick, with no Save button. A failed save reverts the field and says why beside it.
- **Activity** merges comments with the audit trail of the item: who changed what, from and to.
  - "Comments" filters to conversation.
  - The trail is not clutter, but it is folded: consecutive field changes by one person within a minute show as one line,
    "Hafiz changed due date and priority", expandable.
- **The composer.**
  - Reply or Internal note, only on a shared item; Reply is selected by default, and the tint makes the choice visible.
  - Files go through the existing store routes. An attachment from the composer belongs to the item and is listed under Files
    too.
- **Unavailable actions say who can.**
  - A disabled "Mark done" carries the popover "Hafiz, who raised it, or the project manager (Nurul) can mark this done."
  - A field the reader may not edit is shown as plain text, with the same popover.

### 5.5 Quick add and the keyboard (staff only)

| Key | Does | Note |
| --- | --- | --- |
| `C` | New item: focuses the quick-add row | Linear's `C` |
| `J` / `K` | Next and previous item, in the list or the open panel | |
| `Enter` | Open the focused item | |
| `Esc` | Close the panel | |
| `S` | Status menu of the focused item | |
| `A` | Assignee menu | |
| `M` | Assign to me | |
| `B` | Switch between list and board | |
| `?` | Show these keys | |

- `/` is not taken. It is already the top bar's global search (`search-box.tsx`), and stays so.
- No key acts while focus is in a field.
- The help dialog is the one place the keys are written down. They are not shown as hints on the screen.

### 5.6 My work (`/my-work`)

```
 My work                                                                                     [List|Board]    
 Items on you across projects                                                                                
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ 🔍 Search      Project ▾    Type ▾                                                                         │
 ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ TO CHECK  2                                                                                               │
 │  Act 9   Submit revised traffic plan        Jalan Kebun upgrade (C-2026-014)   In review    Today          │
 │  RFI 4   Pile cut-off level                 Sekolah Bukit (C-2026-009)         In review    —              │
 │ LATE  1                                                                                                   │
 │  Insp 7  Slab pour L2 (NCR)                 Jalan Kebun upgrade                In progress  2 days late    │
 │ THIS WEEK  3                                                                                              │
 │  …                                                                                                        │
 │ LATER  4    ·    NO DATE  2                                                                               │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **What it holds:**
  - items assigned to me and not Done or Cancelled;
  - **To check**: items I raised that are In review. Those are the only items waiting on me that I am not assigned to.
- **Groups:** To check, Late, Today, This week, Later, No date. This is Linear's "My issues" and ClickUp's "Me mode" as one fixed
  page.
- **Formal acts are not here.** They wait on you in **My approvals**; two lists of the same step would compete.
- The same side panel opens in place. Its header names the project, with a link into the project's Work tab.
- **Board** shows the same items in the four columns, with the project name on each card.
- **Empty:** "Nothing on you." That is all it says; it is the good outcome.

### 5.7 Overview: the project dashboard (RP-02)

A stat row goes on top of the existing Overview cards. Each stat links to its tab.

```
 ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
 │ Progress         │ │ Time             │ │ Cost             │ │ Variations       │ │ Work             │
 │ 41% / 48% plan   │ │ 112 days left    │ │ 48% certified    │ │ +3.1% of sum     │ │ 14 open · 2 late │
 │ In Delay ⓘ       │ │ EOT +30 days     │ │ RM 6.10m of 12.7m│ │ 1 in approval    │ │                  │
 └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```

- **Progress** is the existing legal reading: the In Delay reading, recorded progress against the planned curve. It is not
  derived from activities (§7.1).
- **Cost** reads the contract's SULIT gate already asked for Overview. Withheld shows "SULIT · withheld".
- **Below the stat row:** the budget card and S-curve (§7.4), then the existing On site, Securities and Contract cards.
- **The budget card replaces** the Payment summary and Variation summary cards. Their figures are its lines.

### 5.8 States

| State | Work (list and board) | Panel | My work |
| --- | --- | --- | --- |
| No items yet | EmptyState "No work yet", a "New item" button, and a quiet "or press C" | — | "Nothing on you." |
| Filtered to nothing | The view's own `emptyTitle` ("Nothing late"), plus Clear | — | — |
| Loading | Skeleton rows or cards in the layout's shape; the toolbar is live at once | Header first, then the body | Skeleton |
| Save refused (fault) | The cell or card reverts; a toast gives the fault's words | The field reverts, with the words beside it | Same |
| Save failed (network) | Reverts; "Not saved. Try again." with Retry | Same | Same |
| Changed by someone else | Guarded on the status read. Refused with "Aisyah moved this to In review a moment ago", and the item refreshes | Same | Same |
| No permission to edit | Selects drawn as text. A popover names who can. | Same | — |
| Contract not yet signed | No Work tab (Award to Signing) | — | — |
| Contract closed or terminated | Read-only. A neutral Callout says "Closed. Read only." No New item, no drag. | Fields as text; comments closed | Items drop out |
| Item cancelled | Done view only, struck through with its reason | Banner "Cancelled: {reason}", and Reopen for the raiser | Drops out |
| Linked act withdrawn | Done column for 14 days, reading "Withdrawn" | Facts plus Open link | — |
| Lead not named | Contractor-raised items unassigned. Team tab shows "No project manager" (warn) | "Unassigned" | — |
| Contractor has no active account | Assigning to {contractor} is allowed. Warn chip "No active portal account". | Same | — |

---

## 6. The contractor's view (`/supplier/projects/[id]`)

- **The tab strip:** Overview · **Work** · Programme · Site diary · Payments · Certificates · Documents.
- Phase 2's portal **Defects** tab folds into Work, as the view **Defects** (Q5). "Mark as fixed" is the defect item's primary
  action and calls the same act.
- **No board, no keyboard shortcuts, no bulk actions.** These are staff density. A site agent a few times a week needs a list
  that says what to do next.

```
 Jalan Kebun upgrade · Contract C-2026-014                                                                   
 [Overview] [Work] [Programme] [Site diary] [Payments] [Certificates] [Documents]                            
                                                                                                             
 WAITING FOR YOU  3                                                                      (+ Ask a question)  
 ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐ 
 │ RFI 12   Rebar spacing at grid C4                   Due 25 Oct · 2 days late          ( Reply )          │ 
 │ SI 3     Relocate manhole MH-07                     Due 5 Nov                          ( Open )           │ 
 │ Defect 41 Cracked tile, Block B                     Due 8 Nov                          ( Mark as fixed )  │ 
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘ 
 WITH {ORG}  2                                                                                               
 │ RFI 15   Kerb detail at junction                    Asked 22 Oct · sent to Aisyah, Site engineer         │ 
 │ Insp 7   Slab pour L2                               Sent for checking 26 Oct                             │ 
 CLOSED  ›                                                                                                    
```

- **The groups are where the item is waiting.** "Waiting for you", "With {org}", "Closed". These are not status names (the
  principle: show state, not process).
- **Each row has one button.** Its words come from the type and state: Reply, Mark as fixed, Send for checking, Open.
- **Opening an item** shows a full-height drawer, modal, at the `md` width. It holds:
  - the title, the due date, the description and, for an RFI, the Answer;
  - files, then the conversation (Replies only), then one composer with "Send";
  - the primary button at the top: "Send for checking" (→ In review) or, on an RFI the contractor raised and {org} answered,
    "Accept answer" (→ Done) and "Ask again" (→ back to {org}, with a reply).
- **The contractor raises** via two buttons in Work, "Ask a question" (RFI) and "Report an incident". Each opens a short drawer:
  title, details, location, files and, for an incident, severity and when. The new item is shared and assigned per §4.9.
- **The contractor cannot** reassign, change a due date or priority, cancel, or see internal notes or staff watchers. A due date
  they disagree with is a reply.
- **Words.** "Sent to {org} for checking", not "Status: In review". "2 days late", not "Overdue". "Sent back to you: see the
  reply", not "Returned".
- **The portal home's "Waiting for you"** (the existing `WaitingList`) gains these rows beside documents. It is one list of
  everything waiting, across contracts.
- **Empty:** "Nothing waiting for you." Under Closed: nothing is drawn when empty.

---

## 7. Phase 4

### 7.1 Timeline tab: the Gantt (4a)

```
 Timeline                       Revision 3 in force ▾   Compare with: Revision 1 ▾   [Week|Month|Quarter]   (Update progress)
 ┌─────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────┐
 │ Activity                 Start  Fin. │  Sep        Oct        Nov        Dec        Jan        Feb        Mar          │
 ├─────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
 │ ▾ Substructure          02 Sep 18 Oct│ ███████████████▌                     │today                                   │
 │    Piling               02 Sep 27 Sep│ ████████▒▒                           │                                        │
 │    Pile caps      ↳     30 Sep 18 Oct│         ░░░███████▒                   │                    2 open ●          │
 │ ▾ Superstructure        21 Oct 31 Jan│                 ████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                            │
 │    Slab L1        ↳     21 Oct 15 Nov│                 ████▒▒▒▒▒                                                  │
 │    Slab L2        ↳     18 Nov 13 Dec│                           ▒▒▒▒▒▒▒▒                                         │
 │ ◆ Roof watertight       31 Jan       │                                             ◆  RM 850,000                  │
 │ ◆ Practical completion  28 Feb       │                                                    ◆ ┊ EOT +30d ┊◆         │
 └─────────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────┘
  ███ done  ▒▒▒ planned  ░░░ baseline (Revision 1)   ◆ milestone   ↳ depends on the row above   ┊ completion date

 EXTENSION OF TIME         (Phase 2's Time tab content, unchanged)
 PROGRAMME REVISIONS       (the Programme card, moved from Site)
```

- **Reading is the job.** The engineer and PM look at it daily. The plan changes formally, by revision; it does not change by
  dragging bars.
- **What it draws:**
  - activities as bars, with summary rows that collapse;
  - finish-to-start dependencies as thin connectors (start-to-start and lag shown in the panel, not drawn);
  - a today line;
  - the completion date: the original, and the extended one with its EOT;
  - programme directions and the CNC as markers;
  - milestones as diamonds, with an amount on payment milestones;
  - a dot with the count of open work items linked to an activity.
- **Clicking a bar** opens the same side-panel shell with the activity: dates, baseline dates, variance in days, predecessors,
  progress, and linked items with "+ Link item".
- **The light edit**, with one primary action, **Update progress**:
  - per activity: actual start, percent complete, actual finish, and a forecast finish;
  - a grid drawer of the activities in progress and due to start this period, in one form;
  - staff only (the contractor sees it read-only; Q6 covers whether they may propose).
  - Changing planned dates, adding activities or changing dependencies happens only in a revision (§7.2).
- **The legal reading is untouched.**
  - The In Delay reading still comes from recorded progress against the planned curve (FR-SUP-010).
  - Activities do not overwrite it. When recording progress on Site, the drawer shows "Activities suggest 42%" beside the field.
    It is a hint with an Assumed provenance badge, never a silent promotion (AGENTS.md "gaps stay honest").
- **Compare** draws the chosen approved revision's bars as grey ghosts under the live ones. The panel gives variance in days.
- **States:**
  - **No programme yet:** EmptyState "No programme yet". Staff get "Add activities"; the portal gets "Send your programme in
    Documents".
  - **Revision in draft:** a Callout "Revision 4 is a draft and not in force", with a link to view it.
  - **No time zone:** the existing "Needs the organisation's time zone." notice.
  - **A large programme:** summaries collapsed by default; virtualised rows past 200.
  - **Closed contract:** read-only.

### 7.2 Programme revisions become baselines

- **The `WorkProgramme` revision act stays exactly as it is:** submitted, scrutinised by the S.O. Representative, then approved
  or returned by the Principal S.O. Representative (FR-SUP-006, 012).
- **4a adds activities to a revision.**
  - In draft, the revision opens a grid editor of Activity, Start, Finish (or Duration), Depends on (multi-select of other rows),
    Milestone and Payment amount (milestone-paid contracts only).
  - Rows can be added, indented, outdented and deleted.
  - "Copy from Revision 3" starts a new revision from the one in force.
- **Approval freezes the revision's activities as its baseline.** Nothing edits them after.
  - "Revision 1" is the original baseline, and the latest approved revision is the one in force.
  - Progress (§7.1) is recorded against the activity in force. A new revision carries progress over by matching activities.
- **The planned curve** (`ProgrammePoint`) stays the legal input.
  - When a revision has activities, its editor offers "Fill planned curve from activities", weighted by duration.
  - The officer sees the result and may change it before approval.
- **MS Project / Primavera XML import is later.** It fills the same grid in a draft revision and is never a separate path.
  Procore keeps re-imports clean by asking for Save rather than Save As, so activity ids survive; the import keys on the file's
  activity id for the same reason.

### 7.3 Milestones and payment milestones (4b)

- **A milestone** is a zero-duration activity. It is drawn as a diamond, and is in the programme like any activity.
- **A payment milestone** is a milestone with an amount, offered only when the contract type's `paymentRoute` says paid by
  milestone.
  - That is a new route value beside `CERTIFIED_CLAIM` and `DELIVERY_ORDER_INVOICE`. It is a customer policy, set on the type
    (AGENTS.md: a policy is a column).
  - Works stay on measured valuation.
  - The RSAJ pack sets no type to it until RSAJ says which (Q4).
- **The amounts** must sum to the contract sum, or a warning shows the difference. A payment milestone's amount changes only
  through a revision or a variation's adjustment.
- **Budget › Payment milestones** is a `DataList`:

| Milestone | Amount | Planned | State |
| --- | --- | --- | --- |
| Roof watertight | 850,000.00 | 31 Jan | Achieved 29 Jan · Claimed · Certified (IPC 6) · Paid 14 Feb |

- **The state is read, never stored twice.** It moves Not due → Due → Achieved (recorded by staff, with a day and evidence) →
  Claimed → Certified → Paid.
- **The contractor's claim** (PC-01 "against BQ items or milestones") lists the achieved, unclaimed milestones as checkboxes.
- **The interim certificate's** work done to date is the sum of certified milestones on this route. The certificate arithmetic
  is the architect's (retention, LAD, recovery as today).
- **Phase 1 dependency.** The architect must state how FS-8's *certified* reading counts this route, so the project card and
  Dashboard › Use of proceeds stay equal.
- **Linked cards.** A due, unclaimed payment milestone appears on the Work board as a linked card ("Milestone due: Roof
  watertight"), and leaves when claimed.

### 7.4 The budget card and the money S-curve (4b)

```
 Budget                                                        Funding  Sukuk A 60% · Federal 40%  ⓘ
 ┌──────────────────────────────────────────────┬─────────────────────────────────────────────────────────────┐
 │ Contract sum                  12,400,000.00  │  RM m                                                       │
 │ Adjustments issued              +310,000.00  │ 13 ┤                                           ....·····     │
 │ Committed                     12,710,000.00  │    │                                  ....·····             │
 │ Approved, not yet adjusted       +85,000.00  │  8 ┤                       ....·····     ___/                │
 │ In approval (1)                 +120,000.00  │    │             ...····      ____/‾‾‾‾                      │
 │ Forecast final   [Assumed ⓘ]  12,915,000.00  │  4 ┤      ...···     ____/‾‾‾                                │
 │ ─────────────────────────────────────────── │    │ ..··  ___/‾‾‾                                            │
 │ Certified to date   48%  ███████░░░  6.10m   │  0 ┼──┬────┬────┬────┬────┬────┬────┬────┬────┬────┬──        │
 │ Paid                                 5.54m   │      Sep  Oct  Nov  Dec  Jan  Feb  Mar  Apr  May  Jun        │
 │ Left to certify                      6.61m   │   ···· Planned [Assumed ⓘ]   ─── Certified   ___ Paid         │
 └──────────────────────────────────────────────┴─────────────────────────────────────────────────────────────┘
  By funding source ›
```

- **The figures are Phase 1's readings, word for word** (`sukuk-core-plan.md` FS-8). The project card and Dashboard › Use of
  proceeds must agree to the sen.
  - **Committed** is the contract sum plus the nets of issued adjustments (`readIssuedAdjustments`).
  - **Certified** is the issued payable certificates' paid figure.
  - **Paid** is the finance payments.
  - A figure that cannot be read says "Cannot be read" and names why. It is never zero.
- **"Approved variations" is two lines,** because FS-8 counts a variation only once its adjustment certificate is issued.
  - **Approved, not yet adjusted:** approved variations whose adjustment is not issued.
  - **In approval:** variations in routing at their valued amount, with a count.
  - Neither is in Committed. This is Procore's split between revised budget and pending budget changes.
- **Forecast final** is committed, plus approved not yet adjusted, plus in approval.
  - That formula is a product assumption, not a rule from any document, so it carries the **Assumed** provenance badge. The
    popover gives the formula.
  - Q2 asks whether {org} defines it differently.
- **There is no "budget" above the contract sum by default.**
  - The approved allocation lives in D365, and that link is on hold.
  - The requisition estimate is SULIT and is not read here.
  - So the card compares against Committed. If Q2's answer is an entered allocation, it adds one top line, "Allocation", with its
    provenance and the headroom.
- **The S-curve** is three cumulative monthly lines, from possession to the (extended) completion month:
  - **Planned:** the in-force revision's planned percent × Committed. It is Assumed (PS-06 "from the contractor's programme"),
    and on a milestone-paid contract it is the payment milestones by planned date instead.
  - **Certified** and **Paid:** the readings above, by month of issue and of payment.
  - Hover gives the month's values; the chart's text summary is kept for screen readers (`summarise`).
- **By funding source ›** opens a small `DataList`: Source, Share, Committed, Certified, Paid.
  - It uses Phase 1's `splitSen`, so the rows add to the card to the sen.
  - With no split recorded it reads "From the requisition: {source} 100%".
- **By cost category** is a section of the Budget tab, not of the card (PS-04, BQ sections mapped to cost categories). It depends
  on Finance's open decision 3 (PO line per cost category or per BQ item). Decision 4 (retention accounting) decides whether
  retention shows as its own line. Both are named dependencies of 4b, not designed around.
- **States:**
  - **Before possession:** the card shows the sums, and the curve shows "Starts at possession".
  - **SULIT withheld:** each money figure reads "SULIT · withheld", and the curve is not drawn.
  - **Supply contracts:** certified is not held, so the card shows Paid only, with the Phase 1 popover words.

### 7.5 PDF letters and certificates (4b)

- **The template engine stays.** An issued certificate or letter gains **Download PDF** as its secondary action, on its own page
  and as a row action in Documents › Certificates. Print stays for drafts.
- **The PDF is rendered from the issued record's frozen content**, so it never differs from what was certified.
- **Unissued drafts** download watermarked "Draft".
- The six appointment letters are templates in the same engine. Which six, and their fields, is the architect's plan, not this
  note's.

---

## 8. Components: reuse first

**Reused as they are:**
- `PageHeader`, `Tabs`, `Card`/`CardHeader`/`CardBody`;
- `Badge`/`Chip`/`Dot`, `Avatar`/`AvatarStack`, `Button`/`ButtonLink`/`IconButton`;
- `Select`, `Field`/`Input`, `Toggle` (List|Board, Week|Month|Quarter, Reply|Internal note);
- `MoreActions`, `EmptyState`, `Callout`, `Meter` (certified %), `KeyValues`, `Stat` (Overview row);
- `RuleInfo` and `InfoChip` (popovers), `ProvenanceBadge` (Assumed);
- `ConfirmDialog` (Cancel with reason), the `Sections` pattern, `DrawerHeader`;
- `DataList`: views, filters, server mode, selection.

**Extended, in their own files:**

| Component | Extension | Why |
| --- | --- | --- |
| `drawer.tsx` | A non-modal **side panel** variant: no scrim, the page behind stays live, the address holds the record, `J`/`K` step. Same widths and header. | The item and activity panels. One shell, so it cannot drift from the other drawers. |
| `DataList` | A `select` **cell kind** for inline edit; its toolbar (views, filters, search, view switch) extracted as **`ListToolbar`** so the board uses the same one | The list and board share one filter bar. |
| `chart.tsx` `TrendLine` | **N series** (today: one line and one reference), a dashed style per series, and a vertical marker (today) | The S-curve has three lines. |

**New, in `src/components/ui`:**

| Component | What it is |
| --- | --- |
| `board.tsx` | Columns with a count, cards (data, like DataList cells), drag with a keyboard alternative, a per-column quick add, a column cap with "Show more", optimistic move with revert |
| `activity.tsx` | The merged feed of comments and history, with grouping of consecutive changes, the All/Comments filter, and the internal-note tint |
| `composer.tsx` | A textarea, files through the store routes, the Reply/Internal note toggle, Send |
| `gantt.tsx` | The activity tree, bars (planned, done, baseline ghost), milestones, finish-to-start connectors, today and completion lines, the zoom, and virtualised rows |
| `shortcuts.tsx` | The key hook that ignores fields, plus the `?` dialog |

- The **icons** (board, list, chain, building, lock, diamond, Gantt) go in `src/components/icons.tsx`.
- The screen comparator records Work, Timeline and My work as **new screens with no prototype** in `ALLOWED_EXTRA`, with this
  note as the reason.

---

## 9. Build order

One heavy builder at a time, as today. Each stage ships alone.

### 3a: the engine, the list and the side panel

- **Scope:**
  - work items with the seven types, the four statuses plus Cancelled, the fields, numbers, watchers, comments (Reply and
    Internal note), attachments, links and the history;
  - the pure move rules;
  - the Work tab (case-level) with the List view and its toolbar, quick add and inline edit;
  - the side panel, the keys, and the notices.
  - **The assignee picker** is the organisation's active people plus "{contractor}"; the team arrives in 3b.
  - **Defect items:** snags only, until Phase 2's lines exist. The link acts are wired if Phase 2 has shipped by then.
- **Done when:**
  - A staff member creates each type on an active contract and finds it in the list.
  - They open the panel by click, `Enter` and pasted address, and edit every field inline.
  - They comment both ways, attach a file through the store, and see the merged activity.
  - Every create and change writes an audit row with before and after in the same transaction.
  - The pure move rules have a table test of every from, to and actor: raiser, assignee, lead, other, contractor.
  - "Late" is judged on the organisation's day, with a test at midnight in its time zone.
  - The new notice kinds and the CHECK are changed together in one migration, and the inbox shows them.
  - Each §5.8 state is rendered by a screen test.
  - `scripts/check-ui.mjs` passes, and `text-snapshot` shows no codes on screen.

### 3b: board, My work, contractor, team and linked cards

- **Scope:**
  - the Board view on the same toolbar;
  - `/my-work` in the nav;
  - linked cards for variations, EOT claims and certificates in routing;
  - the Project team card and default assignees;
  - the contractor's Work tab, "Ask a question", "Report an incident", and the portal home's Waiting for you rows;
  - the portal Defects tab folded into Work (subject to Q5);
  - Certificates folded into Documents, with the old address aliased.
- **Done when:**
  - A drag and the status select make the same act and refuse with the same words.
  - Every board action works from the keyboard alone.
  - A linked card cannot be moved, and opens to its register.
  - My work shows exactly the §5.6 set across two projects.
  - A contractor sees a shared item, replies, attaches and sends for checking, and never receives an internal note. A scan test
    on the portal reader holds that, as `supplier-reach.test.ts` does for routes.
  - No staff surface renders a portal contact's name outside the gated audit trail (a scan test).
  - Contractor-raised items reach the role's holder, or the lead when the role is empty.
  - Every old `?tab=` address still lands (the `caseTabToStep` tests extended).

### 4a: the timeline

- **Scope:**
  - activities on programme revisions: the grid editor, dependencies, milestones;
  - approval freezes the baseline;
  - the Gantt (read, compare, the light progress edit);
  - Time relabelled Timeline, with the Programme card moved;
  - items linked to activities;
  - the portal's Programme tab shows the in-force Gantt, read-only.
- **Done when:**
  - An approved revision's activities refuse any edit (a db test).
  - Compare draws any two approved revisions.
  - Progress by activity saves only through Update progress.
  - **The In Delay reading is unchanged** for every demo contract, with a regression test before and after.
  - "Fill planned curve from activities" is offered only in draft and is shown before it is saved.
  - Old `?tab=time` and `?tab=site&section=start` links land.

### 4b: budget, payment milestones, S-curve and PDF

- **Scope:**
  - the budget card and S-curve on Overview, replacing the two summary cards;
  - the Overview stat row;
  - the Budget label and its Budget, Payment milestones and By cost category sections;
  - the milestone payment route on the contract type, and claims and certificates against milestones;
  - funding by source;
  - Download PDF on issued certificates and letters.
- **Done when:**
  - Committed, Certified and Paid on the card equal Dashboard › Use of proceeds for every demo contract, to the sen (a test).
  - Forecast carries the Assumed badge.
  - A contract whose type is not milestone-paid shows no Payment milestones section anywhere.
  - Payment milestone states are read from claims and certificates, never stored twice.
  - A downloaded PDF's figures equal the issued certificate's frozen figures.
  - **Gated on** Finance's open decisions 3 and 4 for By cost category only. The rest of 4b does not wait.

### Later, not scheduled

- MS Project / Primavera XML import into a draft revision.
- A routine site meeting record (§3.5), if users ask.

---

## 10. Patterns drawn on

| From | Taken | Why it fits |
| --- | --- | --- |
| Linear | Peek side panel instead of a page hop; `C` to create; `J`/`K`; one list/board switch on one filter; "My issues" grouped by due | Staff work all day; a page hop per RFI costs minutes a day. [Linear navigation guide](https://linear.app/enablement/guide/navigating-linear), [keyboard help](https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help) |
| Jira | Board columns mapped to statuses; the two default quick filters "Only my issues" and "Recently updated" as fixed views; Service Management's Reply vs Internal note | The quick filters cover most needs without a filter builder. The two-button comment makes leakage a visible choice. [Jira board work mode](https://confluence.atlassian.com/agile065/jira-agile-user-s-guide/using-a-board/using-work-mode) |
| ClickUp | List, Board and Gantt as views of one set; "Me mode" (became My work) | One data set, many lenses. [ClickUp views](https://help.clickup.com/hc/en-us/sections/17044387445399-Intro-to-views), [developer view types](https://developer.clickup.com/docs/views.md), [Me mode](https://processdriven.co/hub/clickup-views-explained-clickup-tutorial-for-beginners-on-filters-group-by-sort-by-me-mode) |
| Procore RFIs | The RFI as a question with a responsible party, a due date and an official answer, not a chat. Procore's Draft state and its RFI Manager hand-off are not taken: an item is live when raised. | EX-03. [Procore: draft RFI](https://support.procore.com/faq/what-is-a-draft-rfi) |
| Procore punch list | Assignee says ready, raiser accepts or sends back. **Taken as one review step, not Procore's eight statuses and two extra roles.** | CC-01 and CC-02 need the check, not the ceremony. [Procore punch list workflow](https://support.procore.com/faq/what-is-the-punch-list-work-flow) |
| Procore schedule | The master schedule is read-only and comes from an import; re-import keyed on stable ids | The plan changes by revision; the Gantt is for reading. [Procore read-only schedule](https://support.procore.com/products/online/user-guide/project-level/scheduling/tutorials/import-a-read-only-project-schedule) |
| Procore budget | Revised budget kept apart from pending changes; a forecast shown as its own column | FS-8 counts a variation only when adjusted, so pending must be its own line. [Procore standard budget view](https://support.procore.com/products/online/user-guide/project-level/budget/tutorials/about-the-procore-standard-budget-view) |
| Oracle Aconex | A response-required mail is outstanding until anyone in the recipient organisation responds | Assigning to the contractor company, not a contact (§4.5). [Aconex: create mail](https://help.aconex.com/mail/create-mail/), [Aconex RFIs](https://docs.oracle.com/cd/F33532_01/English/user/cic_ref_risk/87115.htm) |

---

## 11. Rejected

- **A separate project workspace beside the case page.** The alternative was `/projects/[id]/work` with its own left nav of
  tools (Procore's model): RFIs, Instructions, Inspections, Schedule, Budget.
  - It reads as SaaS. But it puts a second navigation beside the stepper and tabs, and the formal acts would sit in one structure
    and the work in another.
  - Users would have to learn which half holds a thing.
  - One case page with one more tab keeps one place for the project. The board's linked cards bridge the formal and the informal
    without moving either.
- **A tab per type** (RFIs, Instructions, Inspections, Incidents, Defects). That gives five tabs, five lists with the same
  columns, and no single view of what is late. Types are a filter, not a place.
- **A new Budget tab** beside Payments and Variations. It would add a tab whose figures already live in those two. The budget is
  a card on Overview and a label on the existing tab.
- **Per-type statuses** (RFI: Open, Answered, Closed; Punch: eight states). A board with different columns per type cannot be one
  board. The type-specific step lives in a field, not a status: the Answer, the Result.

---

## 12. Not built

- Sprints, story points, velocity, backlog ranking, epics (founder).
- Custom workflows, custom fields, custom types and statuses (founder; decision 7).
- Saved-filter management. Filters live in the address and the views are fixed; a link is the saved filter.
- Subtasks and checklists. Link items instead.
- Manual card ordering within a column. It needs a rank field and gives no information.
- Dragging Gantt bars to reschedule, critical-path calculation, resource levelling. The plan changes by revision.
- Time tracking and timesheets.
- A calendar view. My work's date groups answer "what is due".
- Offline or phone capture (EX-04): desktop only.
- Email notices: parked.

---

## 13. Word budgets (0005 §3.1)

| Element | Budget |
| --- | --- |
| Tab labels, view chips, column headers, status names | 1–3 words |
| Card | Number, title and date. No sentence. |
| Empty state | A title of 3 words or fewer and a button. No body sentence. |
| Toasts and refusals | One sentence, naming who can |
| Side-panel facts | A label and a value. Explanations only in popovers. |
| Portal row button | 1–3 words ("Mark as fixed") |
| Callouts | Only for a state that asks something of the reader (draft revision, closed contract) |

---

## 14. Test with real users before committing

1. **Board or list as the default.**
   - Give three site engineers a seeded project with 60 items.
   - Ask: "What is late on Jalan Kebun?" and "Close everything Hafiz has checked."
   - Measure time and errors with each default. Expectation: list for the engineer, board for the PM's weekly look.
2. **Reply vs Internal note.**
   - Have five staff answer a contractor while adding a private remark.
   - Watch whether anyone sends the private remark as a Reply. One leak means the toggle needs a stronger default: Internal note
     as the default on items the contractor did not raise.
3. **Assigning to the company.**
   - Ask two contractors' site agents whether "assigned to {contractor}" is clear when three people share the login set.
   - Ask whether they need to pass items to a named colleague. If yes, per-contract membership (PW-17) comes back.
4. **The contractor's first visit.**
   - A site agent opens the portal with an SI and an RFI waiting.
   - Can they say, without help, what to do first and how to answer?
5. **The Gantt as a reader.**
   - Show a PM the Gantt and the old programme card.
   - Ask whether the job is behind, and on what. Check that they do not try to drag bars. If they do, the "Update progress"
     button is in the wrong place.
6. **Forecast final.** Show a QS the budget card. Ask what "Forecast final" means to them. This answers Q2.
7. **Routine site meetings.** Ask whether linking action items to a minutes document is enough, or whether the meeting itself
   needs a record.

---

## 15. Open questions for the product owner (each with a default)

| # | Question | Default if not answered |
| --- | --- | --- |
| Q1 | Items carry numbers per type ("RFI 12"), unlike documents (PW-4). Agree? | **Yes.** RFIs and instructions are quoted by number in letters and claims. |
| Q2 | What is the project budget, and what is "forecast final"? | **The budget is Committed** (Phase 1's reading); no separate allocation until the D365 link. **Forecast** = committed + approved not yet adjusted + in approval, shown as Assumed. |
| Q3 | Are the four team roles fixed product defaults, or may a customer rename or add them? | **Fixed**, like types and statuses (decision 7). Roles never carry authority. |
| Q4 | Which contract types are paid by milestone? | A new payment route on the contract type, **set by the customer**. The RSAJ pack sets none until RSAJ answers. Added to the RSAJ questions. |
| Q5 | Fold the contractor's Defects tab (Phase 2) into Work, and the staff Certificates tab into Documents? | **Yes, both**, in 3b. Old addresses resolve. Phase 2's close-out Defects tab, the legal schedule, stays. |
| Q6 | May the contractor update activity progress on the Gantt, as they may the diary (decision 5)? | **No, staff only** in 4a. The contractor sees it read-only and says so in the diary. Revisit after test 5. |
