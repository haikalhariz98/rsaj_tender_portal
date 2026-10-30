# Product owner rulings on the workspace 3b-ii code review (2026-10-30): BINDING

These rule on six decisions raised by the code review of workspace 3b-ii: My work, linked cards, the defect link and the folds. They are read with:
- the plan `docs/notes/plans/workspace-3b-build-plan.md` (B-18, steps 8 to 12 and the Handoff log);
- ADR 0049 (D5) and ADR 0047;
- the rulings WB-1 to WB-13 and WSEC-1 to WSEC-10;
- the close-out plan §4.2 to §4.4.

The product owner takes them for the founder. They are numbered WR-n so they never collide with WS-, WB- or WSEC- numbers. Where a ruling amends the
plan, the ADR or an earlier ruling, that text is read as amended.

**"Build now"** means the 3b-ii fix round, before 3b-ii is accepted (WB-1). **"Backlog"** means a row in `docs/notes/backlog.md`.

**One rule governs every ruling below:** a linked Defect item is a view of its defect line, and the line is the legal record (ADR 0047, ADR 0049
D5). So on a linked item, the line's rules decide who may act, what a note says, which date counts and how long the text is. The item's own rules
do not.

**For the founder:** there are no new questions, and none of these rulings reverses one of his answers. OQ-4 ("a Defect item is refused past
practical completion", 2026-10-29) was already lifted by WB-12 within its own scope ("until 3b wires the link"). Q1 (OQ-B5) and Q2 (OQ-B9) of the
WB rulings are unchanged and still his.

## Rulings

- **WR-1 (D1). The contractor may "Mark as fixed" any shared linked Defect item, held by it or not. A linked item whose line sits on a draft CPC
  stays visible, offers Reply only, and is refused in honest words.** Build now.
  - **Who may act:** the line decides. Close-out §4.2 makes the contractor always the responsible party for a line, and the portal Defects view
    already lets it report any line it can see. Allowing this only when the item is assigned to the contractor would make the Work drawer refuse
    what the Defects view allows on the same line. In `moveAsContractor`, the linked branch is taken before the item's who-holds-it checks in
    `moveFaults`. The step-10 note already says those checks do not apply to a linked item. The `expectedFrom` (stale page) check is kept.
    `portalAction` offers "Mark as fixed" on a linked item whose line is open and reportable, whoever holds it.
  - **Groups unchanged:** the portal groups still follow the assignee. The button follows the line. No change is made to `portalWhere`.
  - **Draft CPC:**
    - **Shown:** the item was shared on purpose, as a snag, before it was picked. Hiding an item the contractor has already seen would look like
      a deletion. The portal readers also keep filtering on their two columns (ADR 0049 Consequences).
    - **Reply only:** no "Mark as fixed" is offered (WB-5 / WSEC-5: no control that is always refused). `portalAction` needs a "line on a draft
      CPC" fact from the reader.
    - **The backstop's words:** a stale page that still posts is refused with "Not yet: this can be marked as fixed once practical completion
      is certified." It is never "That defect is not on this contract.", which is untrue of an item the contractor can see. The words do not
      say that a draft certificate exists (F6). Every contractor applies for completion, so "once practical completion is certified" tells it
      nothing new.
    - **Unchanged:** the portal Defects view keeps F6, so draft lines are still not listed there.
  - *Why:* one rule for one line ("a defect has one home", WB-12). Honesty on screen: a refusal must not claim that a visible item is missing.
  - *Lands:* `src/lib/work/portal.ts` (`portalAction`, with a table test: linked and held by staff, linked and held by the contractor, linked on
    a draft CPC); `portal-read.ts` (the draft fact); `portal-store.ts` `moveAsContractor` / `markFixed` (the branch order, and the draft words
    mapped from the core's refusal); a db test for each.

- **WR-2 (D2). A linked move tells the same people an ordinary move of the same name tells, and each person is told once. The Send back note is
  not copied into a Reply. The line's note is shown, and the staff drawer says that the contractor sees it.** Build now.
  - **What is already sent:** the contractor's Mark as fixed already notifies the S.O. holders and acting holders (`rectifyWithin` →
    `defectRectifiedNotices`). The staff linked moves (accept, return, withdraw) send nothing today.
  - **Added:** after the defect act, a linked move calls the work notice an ordinary move of the same name calls, with the same recipients.
    Today that is:
    - Send for checking / Mark as fixed → the raiser;
    - Send back → the assignee.
    The notice is keyed by the defect event id.
  - **Once each:** a person who has already been told of that event by the defect notice (for example an S.O. who is also the raiser) is left
    out of the work notice. The recipients are deduplicated before writing. Do not rely on `writeNotices` for this, because the two notices are
    of different kinds. This follows the founder's OQ-10 rule ("once each").
  - **The Send back note:**
    - The note stays only on the line's `RETURNED` event, its one home, and no work comment is written.
    - The staff and portal item panels of a linked item show the line's latest return note ("Returned: {note}", read through `defectState`'s
      `returnNote`, as the portal Defects view already does).
  - **The marker:** the portal Defects view prints every line's return note (`supplier/projects/[id]/panels.tsx`), whether or not the item is
    shared. So on a linked item the staff Send back drawer always shows "{contractor} will see this.". It does not follow
    `commentAudience(..., "SEND_BACK")`, which reads the item's party state and would under-report what the contractor sees (WSEC-4).
  - **Cancel:** no marker. The withdrawal reason is not shown on the portal today (checked: the portal reads neither `withdrawnReason` nor the
    item's `cancelReason`). If it is ever shown there, the marker follows it.
  - *Why:* people working the item in Work should hear what they would hear on any other item. A copy of the note would be a second home for a
    legal note. The marker must match what the contractor actually reads (WSEC-4).
  - *Lands:* `src/lib/work/store.ts` and `portal-store.ts` (the linked branches call `tell` with the deduplicated recipients); the item panels
    (the return note); the send-back drawer (`sendBackSeenBy` is true for a linked item); a db test (S.O. and raiser are the same person: one
    notice) and a screen test (the marker on an unshared linked item).

- **WR-3 (D3). On a linked item, title, description, location and due date are locked. The line's effective due date drives lateness and My
  work.** Build now.
  - **Locked:**
    - `fieldFaults` refuses an edit of these four fields on a linked item with "This defect is recorded in Close-out. Remove it from the
      list to change it." while the CPC is a draft, and with "This defect is recorded in Close-out." once the CPC is issued or the line was
      reported during the defects liability period.
    - The panel draws the four fields as read-only, with no edit control (WB-5).
    - The assignee and severity stay editable: they route work and carry no legal weight.
  - **No new act:** before the CPC issues, a correction is Remove from the list (the item stays a snag and is editable again), edit, then add it
    again. After issue the line is frozen (`frozenLines`), and the item must not drift from it.
  - **Which due date counts:**
    - It is the line's effective due date: the latest issued Schedule of Defects' "rectify by", else the line's own due day. This is
      `overdue`'s rule (`closeout/defects.ts`).
    - It is written through to `WorkItem.dueOn`, as status is (ADR 0049 D5), so `workWhere` and `myWorkWhere` stay on one table:
      - at link (`addLinesFromItems`, writing the fallback due day when the item had none, and the WB-12 raise);
      - at the Schedule of Defects' issue (`KIND_ISSUE_HOOK.SCHEDULE_OF_DEFECTS`), for each open linked line it freezes;
      - in the same transaction as each of those, audited on the item.
  - *Why:* two dates for one defect, one of them wrong, is a correctness gap a regulator would not accept. The schedule's date is the one the
    contract enforces (FR-CMP-013).
  - *Lands:* `src/lib/work/fields.ts` (the lock, with a table test) and `labels.ts` (the words); `defect-link.ts` (a pure `linkedDueOn(line,
    scheduleRectifyBy)`); `defect-link-store.ts` / `defect-acts.ts` (link-time write); the Schedule of Defects issue hook (write-through, a db test:
    an open linked line takes the rectify-by, and a made-good one is untouched); the item panel.

- **WR-4 (D4). No: raising a Defect from Work after practical completion records the officer only. Recording on the S.O.'s behalf stays in
  Close-out › Defects.** The refusal words are built now. Recording on the S.O.'s behalf in Work goes to the backlog.
  - **The words:** an officer whom `reportDefect` refuses is refused in its words (WB-12), followed by "To record it for the S.O. from paper,
    use Close-out › Defects." That screen already records on someone's behalf, with its own checks and attribution.
  - *Why:* recording for someone else is a formal, attributed act that already has one home. Adding it to Work's raise drawer brings an extra
    person picker and capacity words to a form the founder wants simple. Less scope over guessed scope.
  - *Lands:* `store.ts` (the WB-12 raise: the pointer appended to the refusal) and `labels.ts`; backlog row "Record a Defect for the S.O. from
    Work, if officers ask (today: Close-out › Defects)".

- **WR-5 (D5). My work hides items on contracts where Work is shut. The rule is read from the act-status table, never restated.** Build now.
  - **Rule:** `loadMyWork` and `myWorkWhere` keep only contracts whose status `actStatusFault("WORK_ITEM", status)` allows. No list of statuses
    is written into `my-work.ts` or the query: the allowed statuses are derived from the table. A table change (WORK_ITEM is `executed(PC, MGC,
    FCI)` today) moves My work with it.
  - **Still reachable:** the item stays on its contract's Work tab exactly as it stands, read-only, as today. A My work address naming such an
    item opens it there or reads "Not on My work". It is never shown as movable.
  - *Why:* My work is the list of what I can act on. An item on a closed or terminated contract cannot move, and showing it would put a "Late"
    nobody can clear on every list. The item is not hidden from the record, only from the to-do list.
  - *Lands:* `src/lib/work/my-work.ts` and `load.ts` (with a test: one item on an active contract and one on a closed contract, and only the
    first is listed); the db test in `work-flow.db.test.ts`.
  - **Backlog:** "Closing or terminating a contract with open work items: say how many at close." That gap belongs to the close act, not to My
    work.

- **WR-6 (D6). Refuse, in the core's words. No dialog. The silent truncation goes.** Build now.
  - **One limit, in the core:** the line's 2,000-character limit sits today only at the Close-out edge (`closeout-actions.ts` lines 153, 230, 250
    and 366). The work path calls the cores directly and skips it, both for the line text and for the Send back and Cancel notes passed to
    `recordDefectAct`. The fix:
    - The limit becomes one exported constant, judged inside `reportDefectFaults`, `cpcLineFaults` and `defectActFaults` (note), so both edges
      refuse in the same words.
    - `closeout-actions.ts` keeps its form `max` from the same constant.
    - The `.slice(0, 2000)` in `defectLineText` is deleted.
  - **The item edge:**
    - A WB-12 raise whose title and description together exceed the limit is refused in the core's words.
    - A CPC pick is refused in the pattern of `addLinesFromItems`: "Not added: {Defect n} is longer than 2,000 characters. Shorten it in Work
      first." The item is still unlinked and editable at that point.
    - The New item drawer and the panel may show the count from the same constant. That is a hint, not a dialog.
  - *Why:* a legal record must never be quietly cut ("gaps stay honest"). One limit in pure code (AGENTS.md rule 3) stops the two edges from
    drifting. A refusal with words is the house pattern, and a dialog is more scope for the same outcome.
  - *Lands:* `src/lib/closeout/defects.ts` / `completion.ts` (the constant and the faults, with tests at 2,000 and 2,001); `closeout/labels.ts`
    (the words); `defect-link.ts` (no slice); `defect-acts.ts` `addLinesFromItems` (the pick refusal); `closeout-actions.ts` (the shared constant);
    a db test for the work path.

## Where each lands

| Ruling | Build now | Backlog |
|---|---|---|
| WR-1 | `portal.ts` `portalAction`, `portal-read.ts`, `portal-store.ts` branch order and words, tests | — |
| WR-2 | linked-move notices (deduplicated), return note in the item panels, send-back marker on linked items, tests | — |
| WR-3 | `fields.ts` lock, `linkedDueOn` write-through at link and at Schedule of Defects issue, tests | — |
| WR-4 | refusal pointer to Close-out › Defects | Record for the S.O. from Work, if asked |
| WR-5 | `my-work.ts` / `load.ts` filter from the WORK_ITEM act-status row, test | Say how many open items remain when a contract closes |
| WR-6 | one 2,000-character constant in the cores, no truncation, pick refusal, tests | — |
