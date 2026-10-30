# Product owner rulings on the workspace 3b build plan (2026-10-30): BINDING

Rules on OQ-B1 to OQ-B13 in `docs/notes/plans/workspace-3b-build-plan.md` §8, read with ADR 0049, design note 0008, the
rulings WS-1 to WS-24 and the founder's answers to 3a's OQ-1 to OQ-10 (2026-10-29). Taken by the product owner for the founder.
The numbers are WB-n so they never collide with WS-n. Where a ruling adds to the plan, the plan is read as amended.

**Two questions are for the founder, not ruled here: OQ-B5 and OQ-B9.** Each departs from something already settled, so the
settled rule is built now and the question goes to him (the section "For the founder" at the end).

## Rulings

- **WB-1 (OQ-B1). Yes: 3b ships in two parts, each accepted on its own.** 3b-i (steps 1 to 7) first, then 3b-ii (steps 8 to 12).
  4a starts only after 3b-ii is accepted.
  - *Why:* each acceptance stays a 3a-sized review, and the leak-critical half is reviewed alone (plan §10). WS-23's order is kept.
  - *Lands:* plan §1, §5.

- **WB-2 (OQ-B2). Yes, the default, with one addition: every act that shares asks first.**
  - The New item drawer presets "Share with {contractor}" by type (on for RFI, SI, Inspection and Defect; on for an Action only once
    the assignee is "{contractor}"; off for Incident and Task), and staff may switch it off. Quick add never shares. No 3a item is
    shared by the migration.
  - **Addition:** assigning an unshared item to "{contractor}" shares it, so it asks the same `ConfirmDialog` as the header's
    Share action ("{contractor} will see this item, its replies and files added from now. This can't be undone."). Cancelling
    the dialog leaves the assignee unchanged. On the New item drawer, the toggle's info popover holds the one-way note; no extra
    words on the form.
  - *Why:* sharing is one-way (B-1, ADR 0049 D1), so a dropdown change must not leak an item without a confirm. Type presets follow
    0008 §4.1 and stay reversible until Create.
  - *Lands:* B-1, `sharing.ts`; §4 staff (assignee select, New item drawer); step 5 "done when" gains "assigning to {contractor}
    on an unshared item asks first", with a screen test.

- **WB-3 (OQ-B3). No: the contractor does not see files attached before sharing.** It sees its own files and files attached at or
  after `sharedAt`. On a shared item an internal note carries no file.
  - *Why:* the one-way rule must not reach back over files staff added while the item was internal (B-3, ADR 0049 D3). A file
    that should be seen is attached again.
  - *Lands:* `audience.ts` `portalSeesFile`; step 4 portal readers and download route; step 5 "Staff only" label.

- **WB-4 (OQ-B4). No: a live work-item file cannot be withdrawn.** PA047 is widened to `WORK_ITEM_FILE`, unconditionally. On an
  unshared item, the person who attached a file, or the lead, may **Remove** it with a reason (audited); the version may then be
  withdrawn. On a shared item nothing is removed; a correction is a new file and a reply.
  - *Why:* once the contractor may hold a file, withdrawing it changes what both sides relied on (B-6, ADR 0042, ADR 0049 D3).
    This decides the backlog row "Decide before 3b shares item files with the contractor"; step 7 closes the row.
  - *Lands:* step 1 (trigger, `heldByProjectFile`, `withdrawFault` words); step 3 `removeFile`; step 5 Remove.

- **WB-5 (OQ-B5). Not ruled: kept as settled, and sent to the founder.** The founder's OQ-8 (2026-10-29) stands: an Inspection
  needs Passed before In review or Done.
  - **Consequence ruled here:** the contractor cannot set a result (B-10), so `portalAction` offers **Reply**, never "Send for
    checking", on an Inspection assigned to the contractor. No portal row carries a button that is always refused. The NCR closes
    by the plan's workaround (the contractor replies "ready"; the raiser takes the item, sets Passed, and closes it).
  - *Lands:* B-9, §3.3 (OQ-8 row unchanged), `move.ts` and `portal.ts` with their table tests. If the founder says yes, it is the
    one row and its tests.

- **WB-6 (OQ-B6). Yes: the contractor writes the Answer of an RFI assigned to it, while it is open.** It is the only field the
  contractor edits; a disputed due date is a reply.
  - *Why:* without it an RFI sent to the contractor can never reach In review (B-10). Matches the founder's direction that both
    sides update shared site records.
  - *Lands:* `fields.ts`; `answerAsContractor`; step 6 drawer.

- **WB-7 (OQ-B7). Yes: the lead changes the Project team card.** The lead is the Project manager, else the S.O. holders and acting
  holders. With no lead, any staff member who may read the case may change it, so the first manager can be named. Every change is
  audited; Remove asks a reason.
  - **Clarification:** a Project manager who is no longer active does not count as the lead, so the card falls back as if none
    were named and can never be locked shut.
  - *Why:* roles route work and never carry authority (WS-3, ADR 0049 D4), so this needs no approval step; the audit row is the
    record.
  - *Lands:* B-12, B-13; `team.ts`, `lead.ts` (with a test for the inactive PM); step 3 team acts; L1.

- **WB-8 (OQ-B8). Yes: several holders, or none, leaves the item unassigned.** With several holders every holder is told; with
  none the lead is told; with exactly one, that person is assigned.
  - *Why:* picking one of several would guess a routing the data does not hold. Unassigned is honest and shows in the Unassigned
    view (0008 §4.9; "gaps stay honest").
  - *Lands:* B-16; `team.ts` `defaultAssignee`; step 4 notices test.

- **WB-9 (OQ-B9). Not ruled: kept as settled, and sent to the founder.** 0008 §4.5 stands: **Reply** is the composer's default on
  every shared item. It is one constant in `audience.ts`; the tint and the lock icon make the choice visible.
  - *Lands:* `audience.ts`, step 5 composer.

- **WB-10 (OQ-B10). Yes: My work is a list only in 3b.** Six groups, the shared side panel, no Board.
  - *Why:* a Board on My work needs cross-contract moves and addresses; less scope over guessed scope. Revisit after 0008 §14
    test 1.
  - *Lands:* step 8.

- **WB-11 (OQ-B11). Deferred: no item → act links and no "Start a variation" from an SI in 3b.** 3b shows read-only linked cards
  only.
  - *Why:* WS-15 names only linked cards; links need new targets, and a prefilled variation drawer touches money routing, which is
    its own change with its own tests.
  - *Lands:* plan §7. Logged as deferred.

- **WB-12 (OQ-B12). Yes: during the defects liability period a Defect item is created with its defect line, in one act.** Before
  PC it is a snag; at CPC raise, open snags are offered to the defect list.
  - **Condition:** the item path creates a legal defect line (ADR 0047), so it runs `reportDefect`'s own who-may and act-status
    checks and is refused in its words. The work item's wider "any staff who may read" raise permission does not apply to it.
  - *Why:* this does not reverse the founder. His OQ-4 answer scoped the refusal "until 3b wires the link", and 3b wires it; a
    defect still has one home, the line.
  - *Lands:* B-18; step 10 (a db test: an actor that `reportDefect` refuses is refused here in the same words).

- **WB-13 (OQ-B13). No: "Raise item" from a diary entry, observation or meeting record is not in 3b.** An Action's "From"
  document covers meetings.
  - *Why:* no ruling asks for it in 3b; a `sourceEntity` link is a later stage if users ask (0008 §14 test 7).
  - *Lands:* plan §7.

- **WS-10 stays the founder's question.** Not ruled here; 3b does not depend on it (B-4).

## For the founder: two questions

**Q1 (OQ-B5). May an Inspection go to In review before it has Passed?** You answered 3a's OQ-8 "no" on 2026-10-29.
- *Built meanwhile:* your answer. The contractor cannot send an NCR for checking; it replies, and staff reassign the item to
  themselves, set Passed and close it.
- *Recommendation: yes.* In review on an Inspection would mean "ready for inspection", for every assignee, and **Done would still
  need Passed**, so nothing closes without a pass. Today every NCR closes through a reassignment that is not a real handover,
  which puts noise in the audit trail and a step staff must remember.

**Q2 (OQ-B9). Should the composer default to Internal note on some shared items?** Design note 0008 §4.5 says Reply on every
shared item.
- *Built meanwhile:* Reply everywhere on shared items (0008 §4.5).
- *Two options are on the table:*
  - (a) 0008 §14 test 2's fallback: Internal note on items the contractor did not raise;
  - (b) the architect's: Reply when the contractor raised the item **or** holds it, Internal note otherwise.
- *Recommendation: yes, option (b).* A leak cannot be taken back. (b) keeps Reply where the conversation is with the contractor,
  including items staff assigned to it, and defaults to Internal where it is a bystander. Either is one constant.

## Where each lands

| Ruling | Plan |
|---|---|
| WB-1 | §1, §5 |
| WB-2 | B-1, §4 staff, step 5 |
| WB-3 | B-3, step 4 |
| WB-4 | B-6, steps 1, 3, 5; backlog row closed at step 7 |
| WB-5 | B-9, §3.3, `portal.ts` (founder Q1) |
| WB-6 | B-10, step 4, step 6 |
| WB-7 | B-12, B-13, step 3, L1 |
| WB-8 | B-16, step 4 |
| WB-9 | B-2, `audience.ts` (founder Q2) |
| WB-10 | step 8 |
| WB-11 | §7 |
| WB-12 | B-18, step 10 |
| WB-13 | §7 |
