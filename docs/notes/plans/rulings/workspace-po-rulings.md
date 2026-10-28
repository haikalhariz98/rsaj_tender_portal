# Product owner rulings on design note 0008, project workspace (2026-10-27): BINDING

Fold the [AMENDS] items into docs/notes/design/0008-project-workspace.md before the architect plans 3a.

## Questions Q1–Q6

- **WS-1 (Q1). Item numbers per project and per type** ("RFI 12").
  - The number is taken under the contract lock, with a unique key on (contract, type, number).
  - Short type words come from the labels map.
  - PW-4 still binds project documents.
- **WS-2 (Q2). Budget figures.**
  - The budget is Committed.
  - Forecast final = committed + approved but not yet adjusted + in approval, tagged Assumed.
  - "In approval" sums each variation's valued amount as the Variations tab shows it, never `matterRoutedValue` (SULIT).
- **WS-3 (Q3). Team roles.** Four fixed roles. They route work and notices and never carry authority. PW-16 is lifted for this card.
- **WS-4 (Q4). Milestone payment route.** It is a new value of `ContractType.paymentRoute`, set by the customer; the RSAJ pack sets none. While unset, the screen reads "How this contract is paid: Not set". Add it to the RSAJ questions.
- **WS-5 (Q5). Both folds happen in 3b,** and the old addresses still resolve. Phase 2 still builds its portal Defects tab, and 3b folds it in. Close-out › Defects stays.
- **WS-6 (Q6). In 4a only staff update activity progress.**

## Navigation and money

- **WS-7 [AMENDS §3.2, §5.7]. "Payments" keeps its label.**
  - Tab strip: Overview · Work · Timeline · Payments · Variations · Site · Documents · Team · History.
  - The budget is a card on Overview.
  - Payments gains the Payment milestones and By cost category sections.
  - The budget card replaces the Payment summary and Variation summary cards only if a text-snapshot diff shows every figure, warning and provenance tag kept.
- **WS-8 [AMENDS §5.7, §7.4]. No "SULIT · withheld" money state.** Overview money follows FS-11's `mayReadBudget`. Contract sums, issued certificate figures, payments and variation values are Internal.

## Naming the contractor's people

- **WS-9 [AMENDS §4.5 reason]. Work for the contractor goes to the company ("{contractor}") in 3a and 3b.**
  - PW-17 stands.
  - Stored StaffNotice bodies must never hold a SULIT name.
  - Leave a nullable per-account assignee column for later.
- **WS-10. Contractor contact names stay SULIT for now.**
  - This is the founder's call, now flagged to him.
  - The proposal: a contact's name (only the name) becomes Internal to staff who may see the case, once that contact's account has acted on that contract.
- **WS-11 [AMENDS §4.5 "Staff names on the portal"]. The portal names a staff assignee only if they are on the Project team card or PW-16's in-force side;** anyone else reads "{org}".

## Keyboard, side panel and portal

- **WS-12 [AMENDS §5.3, §5.5]. No global single-letter keys.**
  - Tab or arrow focus, Enter opens, Esc closes.
  - A focusable status-menu button on each card.
  - Arrow keys across board columns.
- **WS-13. Side panel approved:** non-modal, with the item in the address and one primary action from a pure function. A disabled action names who can. The contractor portal is list-only.

## Build order and cuts

- **WS-14 [AMENDS §9 3a]. 3a is staff-only.** No "{contractor}" assignee and no Shared until 3b. `shared` is false on every 3a item.
- **WS-15 [AMENDS §9 order]. The Board moves into 3a,** beside the List.
  - New 3b: contractor sharing and the portal list (Reply / Internal note), My work, the Project team card and default assignees, linked cards, and the folds.
- **WS-16. Cut:**
  - bulk actions;
  - quick add per board column (list quick-add only);
  - remembering the last view (List is the default);
  - the "Contract acts" toggle (linked cards always show).
- **WS-17. No stored watchers.**
  - Notices go to the raiser and the assignee, plus the lead on items the contractor raised; one notice per comment, to the other party.
  - "Due tomorrow" and "Late" notices only if the existing runner already fires date-based notices. Otherwise Late shows in lists and My work only.
- **WS-18. Activity shows comments and audit rows,** with an All/Comments filter. No grouping.
- **WS-19 [AMENDS §5.8]. No organisation time zone:** "Late" is not judged; show "Needs the organisation's time zone."
- **WS-20 [AMENDS §7.1, §7.2, §9 4a]. Cut from 4a:** Compare, "Fill planned curve from activities", the "Activities suggest n%" hint, and virtualisation.
  - 4a keeps: the grid editor (dependencies, milestones), the baseline freeze on approval, the read-only Gantt, Update progress, and the In Delay reading unchanged.
- **WS-21 [AMENDS §9 4b]. PDF moves to its own stage, 4c.** 4b is the budget card, the stat row, payment milestones and funding by source. By cost category stays gated on Finance decisions 3 and 4.
- **WS-22. Every stage also needs, before acceptance:**
  - demo data through `demo:load` (3a: every type, with late, unassigned and cancelled items on two demo contracts);
  - npm test, typecheck and lint;
  - a sibling-screen check;
  - its log lines.
- **WS-23. Order:** 3a → 3b → 4a → 4b → 4c.
- **WS-24. Fixed defaults:**
  - the seven types, one status set, incident severities;
  - Overdue is read, never stored;
  - numbering and the move rules are pure functions with table tests.
- **Open:** 3b re-checks the defect act names against Phase 2's built acts.
