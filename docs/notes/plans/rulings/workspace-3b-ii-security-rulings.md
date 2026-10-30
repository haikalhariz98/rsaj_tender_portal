# Product owner rulings on the workspace 3b-ii security audit (2026-10-30): BINDING

These rule on the four decisions (D1 to D4) and confirm four Lows (L3 to L6) raised by the security audit of workspace 3b-ii: the defect link,
My work, linked cards and the folds. The audit found nothing Critical or High. They are read with:
- the plan `docs/notes/plans/workspace-3b-build-plan.md` (B-18, B-19, steps 8 to 12 and the Handoff log);
- ADR 0049 (D1, D5) and ADR 0047;
- the rulings WB-1 to WB-13, WSEC-1 to WSEC-10 and WR-1 to WR-6.

The product owner takes them for the founder. They are numbered WRS-n so they never collide with WS-, WB-, WSEC- or WR- numbers. Where a ruling
amends the plan, the ADR or an earlier ruling, that text is read as amended.

**"Build now"** means the 3b-ii security fix round, before 3b-ii is accepted (WB-1). **"Backlog"** means a row in `docs/notes/backlog.md`.

**Two rules govern every ruling below:**
- On a linked Defect item the line's rules decide (WR rulings). The line is the legal record (ADR 0047, ADR 0049 D5).
- A marker says what the contractor actually reads (WSEC-4). A staff screen must never call a thing internal when the contractor reads it.

**For the founder:** there are no new questions, and none of these rulings reverses one of his answers. WRS-1 keeps WB-2 ("quick add never
shares"; every act that shares asks first) intact by not sharing at link. WRS-4 applies his OQ-10 rule ("once each, minus the writer"). Q1
(OQ-B5) and Q2 (OQ-B9) of the WB rulings are unchanged and still his.

## What the contractor reads of a linked line (checked at `b4069495`)

The portal Defects view (`src/app/supplier/projects/[id]/panels.tsx`, `DefectsPanel`) prints, for each line on an issued CPC or reported during
the defects liability period:
- the line's description, which `defectLineText` builds as "{title}: {description}" from the item;
- the location;
- the due day (the schedule's rectify-by, else the line's own due day, which a pick takes from the item);
- the return note ("Returned: {note}") while the line is open;
- the schedule's "Make good by" day in the card's heading.

It does not print the item's comments, files, severity or assignee.

## Rulings

- **WRS-1 (D1). Option (a): the item stays unshared, and every place that copies its text to a line says the contractor will read it. No
  automatic share.** Build now.
  - **The marker:** the WR-2 / WSEC-4 marker component (no new component), with words that fit the room:
    - in the CPC pick drawer (`PickDefectItemsDrawer`), once above the list, in full: "{contractor} will see the title, description,
      location and due day on the defect list.";
    - on New item and Quick add, beside the "Observed on" / "Made good by" fields wherever `defectRaisesLine(status)` is true (the WB-12
      raise): the short house marker "{contractor} will see this.", with the field list in its info popover. WB-2 keeps those forms free of
      extra words, and the founder wants minimal words, so the sentence does not go on the form;
    - on the staff panel of a linked item, beside its share state: the short marker, the field list in its popover. A linked item's panel never shows "Internal" / "Not shared" without it.
  - **The timing:** one wording covers both cases. On a draft CPC the contractor reads the line once the CPC is issued (F6); a WB-12 line is
    read at once. "On the defect list" is true of both, and the words do not say that a draft certificate exists.
  - **Why the marker sits at pick and raise:** WR-3 locks title, description, location and due day at link. The pick drawer and the raise are the last
    point at which staff can still change the words the contractor will read, so the marker must be there, not only after.
  - **Not (b):**
    - It would contradict WB-2. Quick add never shares, and a share always asks the one-way confirm. A pick in Close-out is not a share act.
    - It would expose more than the problem does. The line carries four fields. Sharing the item would also give the contractor every reply
      and file added from then on, one-way (ADR 0049 D1), which staff did not ask for.
  - *Why:* honesty on screen (AGENTS.md "gaps stay honest"; WSEC-4: the marker matches what the contractor reads). Less scope over guessed scope.
  - *Lands:* `src/lib/work/labels.ts` (the words, `{contractor}` from the awardee's name); the pick drawer; the New item and Quick add drawers;
    the staff item panel; a screen test for each of the three, on an unshared item.

- **WRS-2 (D2). Refuse. An In-review Defect item is not offered for the CPC, and a stale pick is refused in words.** Build now.
  - **The feed:** `pickableDefectItems` (`load.ts`) takes open, unlinked Defect items that are not In review, so it offers no option that is
    always refused (WB-5).
  - **The backstop:** in the `addLinesFromItems` pattern, "Not added: {Defect n} is waiting to be checked. Accept or send it back in Work first."
    It is judged on the locked row. The item is not linked and no line is written for it.
  - **Not "accept the reset":** a silent move from In review to In progress undoes the contractor's report with no record that it happened.
    Creating the line already "reported rectified" would put a defect event on the legal record that nobody made on the line.
  - *Why:* gaps stay honest; one act, one effect. WB-5: no control that is always refused.
  - *Lands:* `load.ts` `pickableDefectItems`; `closeout/defect-acts.ts` `addLinesFromItems` (the refusal); `closeout/labels.ts` (the words);
    a db test (an In-review item is refused, its status unchanged, no line written).

- **WRS-3 (D3). The line's who-may decides what the panel offers, read from the core. My work keeps assigned linked items, and lists a linked
  item under "To check" only for someone who may accept it.** Build now.
  - **One rule, not restated:** who may act on a line is decided today inside `recordedFor` (`src/lib/matter/act.ts`): the S.O., or a
    representative whose letter covers site observation, on the day. Extract that decision into one function that `recordedFor` itself calls,
    and use the same function to read "may this person act on this contract's lines today". No second copy of the rule.
  - **The panel (staff Work and My work):** on a linked item, a reader that function refuses sees no defect move buttons and the existing words
    of `linkedMoveWords`, "This defect moves with its line in Close-out." (true in every line state; no new words, and it does not name the
    S.O., since a covered representative may act too). Reply, the assignee and severity
    stay: they route work and carry no legal weight (WR-3). The board's drop is unchanged: the act still answers.
  - **My work:**
    - "Assigned to me": a linked item stays. Someone assigned it on purpose, and the assignee can reply or reassign it.
    - "To check": a linked In-review item is listed only for a reader who may accept it. For anyone else it is not "to check". This is the
      unbuilt C4 of the review fix round.
    - The lookup runs once per distinct contract among the linked In-review rows (My work is capped at 500), through the same function.
  - **If** the extraction would mean writing who-may a second time, stop: label the rows with the same words, and add a backlog row for the
    "To check" filter. Do not restate the rule to fit the list.
  - *Why:* WB-5 (no control that is always refused) and WR-5 (My work is what I can act on). AGENTS.md rule 3: business logic lives in one
    place and screens call it.
  - *Lands:* `src/lib/matter/act.ts` (the extracted decision, with a test that `recordedFor` and the read agree); `src/lib/work/my-work.ts` /
    `load.ts` (the "To check" filter); the item panel (`linkedPanelActions` takes the read); a db test (a raiser who is not the S.O. has no
    linked "To check" row; the S.O. does) and a screen test (no buttons, the words).

- **WRS-4 (D4). Yes, as the auditor recommends: the linked work notice is sent from the cores, whichever screen records the event.** Build now.
  - **Where:** `recordDefectAct` and `rectifyWithin`, after the write-through, only when the line has a linked item. Close-out › Defects, the
    portal Defects view, Work and the portal Work tab all reach it. Unlinked lines send nothing new, so Phase 2's defect tests pass unchanged.
  - **One call site (amends the *Lands* of WR-2):** the `tell` calls that WR-2 added to the Work linked branches (`store.ts`, `portal-store.ts`) are deleted, so nobody is
    told twice.
  - **Recipients:** as WR-2 (Send for checking / Mark as fixed tell the raiser; Send back tells the assignee), keyed by the defect event id,
    deduplicated against the defect notice's recipients before writing, and minus the person who recorded the event (OQ-10).
  - *Why:* whether people working the item hear of a move must not depend on which screen recorded it (WR-2's intent). One home for the rule
    (AGENTS.md rule 3).
  - *Lands:* `closeout/defect-acts.ts`, `portal/projects/defect-store.ts`, `work/defect-link-store.ts` (the shared notice); `store.ts` and
    `portal-store.ts` (the calls removed); db tests: a return from Close-out tells the assignee; a portal Defects-view report tells the raiser;
    an S.O. who is also the raiser is told once.

- **WRS-5 (L3). Confirmed: the portal reader's `moves` is `[]` for a linked item.** Build now.
  - `portal-read.ts` fills `moves` from `contractorActions`, which knows nothing of the link, so the drawer could offer "Ask again" on a linked
    defect.
  - On a linked item the only contractor act is WR-1's Mark as fixed. It comes from `portalAction` (`linkedLine`) and is posted through the
    linked branch of `moveAsContractor`. Neither reads `moves`, so `[]` does not block it (checked: `moveAsContractor` does not gate on
    `contractorActions`).
  - *Lands:* `portal-read.ts`; a table test (a linked item has no moves, and still has the action MARK_AS_FIXED while its line is open).

- **WRS-6 (L4). Confirmed: the WB-12 create's audit row records the item's status (In progress).** Build now.
  - *Why:* the created row must read back whole in the audit trail, like every other create.
  - *Lands:* the WB-12 raise in `store.ts`; the existing WB-12 db test asserts the field.

- **WRS-7 (L5). Confirmed: an old `?tab=documents` address lands on the Certificates card.** Build now.
  - The outcome is ruled, not the mechanism: the old address opens the Documents tab with the Certificates card in view (the card has
    `id="certificates"`; `section=certificates` selects nothing today, and the alias maps in place with no redirect). The builder chooses
    how. This covers stored `StaffNotice.href` rows, which are resolved when read and never rewritten.
  - *Lands:* `case-tabs.ts` / `caseTabToStep` (the fragment); `case-tabs.test.ts` (an old address, including a stored notice href, opens
    Documents with the Certificates card in view).

- **WRS-8 (L6). No notice when a voided CPC unlinks its picked items. The item's Activity says why.** Build now.
  - **No notice:** the void is the event and has its own audit, and the unlink is audited on each item. A notice per item would tell people of
    a record step they did not take, and nothing is asked of them.
  - **Activity:** the item's Activity reads "Removed from the defect list: the certificate was voided." (from the unlink's audit reason), so an
    item that is back as a snag says how it got there.
  - **The due day:** the day WR-3 wrote through stays on the item after the lock lifts. Activity already shows that write, and the item is
    editable again, so staff correct it there. No reset: the old day was the one in force for the line.
  - *Why:* gaps stay honest without adding noise. Less scope.
  - *Lands:* `unlinkPickedBy` in `defect-link-store.ts` (the audit reason); `work/labels.ts` (the Activity words); the existing
    `defect-link.db.test.ts` void case asserts the reason.

## Where each lands

| Ruling | Build now | Backlog |
|---|---|---|
| WRS-1 | the contractor marker: full words in the pick drawer, the short marker with a popover on New item / Quick add (Defect after PC) and the linked panel; screen tests | — |
| WRS-2 | In review left out of `pickableDefectItems`; the `addLinesFromItems` refusal; db test | — |
| WRS-3 | who-may extracted from `recordedFor`; panel buttons from it; "To check" filter (C4); tests | the "To check" filter, only if the extraction proves impossible |
| WRS-4 | linked work notice from `recordDefectAct` / `rectifyWithin`; the Work-path `tell` calls removed; db tests | — |
| WRS-5 | `moves: []` on a linked item; table test | — |
| WRS-6 | status in the WB-12 create audit | — |
| WRS-7 | `?tab=documents` opens Documents at the Certificates card, stored notice hrefs included; test | — |
| WRS-8 | void unlink: no notice, the Activity reason; test | — |
