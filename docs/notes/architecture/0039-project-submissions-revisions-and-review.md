# 0039 — Project submissions, revisions and review

**Superseded by ADR 0042** (`0042-the-simple-project-workspace.md`) and the plan `docs/notes/plans/project-workspace-simple-plan.md`, 2026-10-22, under the product owner's rulings PW-1 to PW-21 (PW-3 to PW-15, PW-18). Nothing below was built. The text is kept as written.

**Status:** Proposed, **held for CPD** (AC-7). Written on 2026-10-19 by the solution architect, at wave P step P0 of design note 0004.
Nothing here is built. No migration and no code follow until the founder records CPD's written sign-off of P-1 to P-7 as [NET-NEW] in
the decisions log, giving the signer's name, the date and the document version, together with the AC-7 policy answers (R-1 in
`docs/notes/plans/wave-p-build-plan.md` §7). The rulings behind this record are AC-24, AC-26 to AC-30 in design note 0004 §4. Table
shapes and pure signatures are declared in the build plan §2 and §3. If CPD's answers differ from the defaults below, this record is
amended before it is accepted.

**Amended 2026-10-20** with the product owner's review of P0 (AC-49 to AC-61, design note 0004 §4, rulings of 2026-10-19, second
set). The AC-61 text amendments are folded in: D5 (AC-51, AC-56), D7 (AC-53, AC-60), D8 (AC-54, AC-60), D9 (AC-55, with the act by
which staff enter a pinned programme's planned progress), D10 (AC-59), D11 (AC-50, AC-53, AC-61 (c)), D12 (AC-61 (c)) and D13
(AC-57). The record is still **Proposed, held for CPD**. Nothing in it is accepted until entry gate items 1 and 2 of the plan are met.

**Relation to earlier ADRs.**
- **Extends ADR 0011 and supersedes nothing in it.**
  - D4 already says new owner FKs "arrive with their modules". This record adds two.
  - It adds a contractor read entitlement alongside D6: the contractor's own files, and the files RSAJ sent it.
  - It adds a per-contract upload bound under D7's rule that an unset policy refuses.
- **Uses ADR 0038** for who reaches the exchange. Reach is not authority: the answer is checked at the act (D4 below).
- **Uses ADR 0034** D11 (actor on the audit), D12 (acts recorded on someone's behalf from paper) and D14 (SULIT reads).
- **Leaves the 6.13 supervision model in place.** `WorkProgramme` stays the programme record. D9 below makes the register its only
  writer for new programmes.

## Context

P-3 to P-7 ask for one exchange per contract:
- the contractor submits one or more files under a type, and the submission gets a number and Revision A;
- RSAJ reviews and answers, and the contractor revises until the answer closes the review;
- RSAJ can send documents too;
- one register lists everything, with review targets per type;
- notices reach both sides;
- everything is kept in the document store and logged;
- the six things a contractor already sends move in.

Today:
- `ContractorSubmission` (`prisma/schema.prisma:12908`) is text only. It has six kinds, one answer (TAKEN_UP or RETURNED), and a
  service level per kind (`ContractorSubmissionSetting`, unset means no due day).
- The answer is given once, guarded by `updateMany` (`src/app/documents/review-actions.ts`).
- The work programme is recorded and decided through its own supervision acts. Scrutiny needs `{ act: "PROGRAMME_SCRUTINY" }` and
  the decision needs `{ principalOrSo: true }` (`src/app/projects/[id]/supervision-actions.ts:392` and `:423`).
- The design note leaves one point to this record (AC-26): whether an approved work programme becomes the `WorkProgramme` record in
  the same act.

## Decision

**D1. A submission is a numbered thread of immutable revisions.**
- **`ProjectSubmission`** carries the contract, a per-contract sequence, the type, the title, the direction and the intent.
  - The sequence is unique per contract. It is shown as `SUB-0001`. That is a reference number like a contract number, not a
    configuration code.
  - The direction is CONTRACTOR_TO_RSAJ or RSAJ_TO_CONTRACTOR.
  - The intent is REVIEW, FOR_INFORMATION or ACKNOWLEDGE.
- **Its status is derived** from the latest revision by the pure `submissionState`. It is never stored, so it cannot disagree with
  its revisions.
- **`ProjectSubmissionRevision`** is what was sent, by whom and on which organisation day.
  - The organisation day is stamped by the server.
  - Its answer, recommendation, passing-on and acknowledgement are each **set once**. A database trigger refuses a second write, and
    the act's guarded update is the first line of defence.
- **Nothing is overwritten or withdrawn.**
  - A contractor cannot withdraw a revision (AC-26).
  - A correction is the next revision, or a new submission.

**D2. Revisions are lettered by a pure function.** `revisionLetter(index)` takes a 1-based index and returns a bijective base-26
letter: 1 → A, 26 → Z, 27 → AA, 52 → AZ, 53 → BA. The letter is never stored, only the index.

**D3. Answers and their sets come from the type.**
- **FOUR:** Approved, Approved with comments, Revise and resubmit, Rejected.
  - Approved and Approved with comments close the review.
  - Revise and resubmit opens the next revision, on the contractor's side.
  - Rejected is final. The contractor raises a new submission (AC-26).
- **TAKEN_UP_RETURNED:** for the interim claim, the materials list and the defects-rectified notice (AC-30).
- **ACKNOWLEDGE:** for the delay notice and the statutory declaration. A declaration is not "approved" (AC-30).
- **RSAJ to contractor, with intent ACKNOWLEDGE:** the contractor acknowledges once. FOR_INFORMATION needs nothing.

**D4. Who may give the answer the contractor sees: checked at the moment of the act (FR-SUP-004, M).**
- **The rule.** The answer comes from a holder of the contract's S.O. office on the organisation's today, or from a delegate in force
  that day whose scope includes `CONTRACTOR_COMMUNICATION`. The check is `recorderFaultToday(..., { act: "CONTRACTOR_COMMUNICATION" },
  ...)` (`src/lib/supervision/load.ts:88`), re-run on the locked rows.
- **Membership does not make an answerer.** A REVIEWER who fails the check may comment and **recommend** only.
- **Assignment.** One reviewer per submission, assigned by the S.O. or a staff Lead. The reviewer is snapshotted on the revision.
- **The final answer replaces the recommendation** on screen. The recommendation stays on the record, with its author.
- **Sending to the contractor.** An RSAJ_TO_CONTRACTOR submission is communication with the contractor, so the same check applies to
  its sender.

**D5. Higher approval is a setting on the type, and each value maps to an existing authority need.**
- **The values:**
  - `NONE`: the D4 answerer answers.
  - `PRINCIPAL_SO_REP`: the reviewer's recommendation is the scrutiny. It needs `{ act: "PROGRAMME_SCRUTINY" }` where the type is the
    work programme. For any other type a team REVIEWER may make it, with no further check. The recommendation is **passed on**. The final answer needs `{ principalOrSo: true }`
    **and** the D4 check. This is FR-SUP-006: scrutiny by the S.O. Representative, approval by the Principal S.O.'s Representative.
    The spec wins over the document's "the S.O. approves" (AC-26).
  - `SO_OFFICE`: the same flow, with the final answer needing `{ soOnly: true }`.
  - `null`: unset. A type cannot be issued while this is unset (AC-27), so no submission ever meets an unset value.
- **A work programme type is never issued with `NONE` (AC-56).** AC-30 gives the work programme the four answers plus higher
  approval, and FR-SUP-006 (M) requires scrutiny, then approval. `typeIssueFaults` refuses a type whose `systemKind` is
  WORK_PROGRAMME and whose `higherApproval` is NONE. `PRINCIPAL_SO_REP` and `SO_OFFICE` are allowed.
- **Why both checks. Adopted, AC-51.** The second check under `PRINCIPAL_SO_REP` is the conservative reading. FR-SUP-004 requires the contractor
  communication scope for whoever speaks to the contractor, and FR-SUP-006 requires the principal capacity for whoever approves. An S.O.
  holder meets both. A Principal representative whose letter leaves out contractor communication is refused, and the screen says why.

**D6. Comments are append-only, and INTERNAL never leaves the building.**
- A `ProjectSubmissionComment` is SHARED or INTERNAL. It sits on the whole revision or on one of its files.
- A comment may carry a marked-up file (purpose `PROJECT_REVIEW_MARKUP`).
- No portal store reads INTERNAL comments or their files. A scan test pins that: the portal's exchange stores never select an INTERNAL
  row, and the contractor's file route refuses a markup whose comment is INTERNAL.

**D7. Targets are snapshotted, and the clock runs only on RSAJ's side.**
- **The target** is the type's `reviewDays` (a number, or an explicit "no target") **when the revision is sent**. It is copied onto the
  revision with its `dueOn`. Editing the type later changes no sent revision.
- **The clock** runs from `sentOn` until the answer, or the acknowledgement for an ACKNOWLEDGE intent from the contractor's side.
  Passing on does not stop it.
- **"Overdue"** means that today, in the organisation's time zone, is after `dueOn`, and the revision still waits on RSAJ. A
  submission waiting on the contractor is never overdue (AC-27).
- **Day basis.** `ProjectExchangePolicy.reviewDayBasis` is CALENDAR or WORKING.
  - Unset reads as calendar days and is shown as ASSUMED (AC-27).
  - WORKING counts against the organisation's `HolidayCalendar`, which already exists.
  - The column is beyond design note §6.3. **Adopted, AC-53.** It has its own provenance column,
    `reviewDayBasisProvenance`, because `ProjectExchangePolicy` holds three answers CPD gives separately (the upload bound, the day
    basis, SULIT to contractors), and one shared tag would state claims nobody made.
  - **The basis is snapshotted with the target (AC-60).** The revision copies `reviewDayBasis` together with `reviewDays` and
    `dueOn`, so a later policy change moves no sent due day.
- **No per-contract override, and no export** (AC-27).
- **The legacy setting.** `ContractorSubmissionSetting.serviceLevelDays` is **not** copied into the system types. Copying it would
  promote a value without its provenance. The organisation enters each type's target through Configuration's two-person path.

**D8. The six existing kinds become system types. The legacy rows stay read-only and are not migrated.**
- **The system types.** `ProjectDocumentType.systemKind` names a `ContractorSubmissionKind`, and the answer set follows D3. The
  organisation still issues each system type through ConfigurationChange, giving its target and its higher-approval setting.
- **Structured details stay typed, and money stays `Decimal`.**
  - The claim amount and its day go in `ProjectSubmissionClaimDetail`.
  - The materials list goes in `ProjectSubmissionMaterialLine`, which mirrors `ContractorSubmissionLine`.
  - Design note §6.3 proposed `detail Json?`. That would put money in JSON, against the non-negotiable rule that money is `Decimal`.
    **Adopted, AC-54.** Both tables carry `organisationId`, with `onDelete: Restrict` relations, as every table does.
- **The declaration keeps its safeguards.** Its password step-up, `contractorSigningFaultOf` and its `ActAttribution` slot all stay.
- **The "sent on" day** is stamped by the server.
- **The legacy rows.** `ContractorSubmission` rows stay as the earlier record, shown read-only, so their `ActAttribution` rows keep
  resolving.
- **The bridge retires per kind.** The old send path for a kind closes only once its system type is issued. Until then, the old path
  takes that kind, so a contractual notice is never refused (AC-27, and ADR 0038 D5). **Adopted, AC-60.**
- **The interim claim's day.** Readers of the claim day, such as the `InterimValuation` CLAIM trigger, read both the legacy row and the
  register revision. P6 pins that with a test.

**D9. An approved work programme is the `WorkProgramme` record, written in the same act. There is one source of truth.**
**Adopted, AC-55, with today's programme rules kept whole.** No rule is weakened, and the signatures stay.
- **On send.** When a revision of the WORK_PROGRAMME system type is sent, the same transaction writes a `WorkProgramme` row pinned to
  it by a new unique FK, `WorkProgramme.projectSubmissionRevisionId`.
  - Its `revision` is the next number for the contract (as today, unique per contract). The register letter is reached through the pin.
  - Its `submittedOn` is the revision's `sentOn`.
  - If one is open, its `ProgrammeDirection` is linked as the direct act links it today.
  - **The send runs `submitFaults` unchanged** (`src/lib/supervision/programme.ts`). NOT_EXECUTED and OPEN_REVISION refuse the send,
    and the screen names the revision still open. FUTURE_DATE cannot arise, because the day is server-stamped. A work programme is not
    a contractual notice (the delay notice is), so AC-27's "never refused" does not reach it. Keeping OPEN_REVISION at send is the
    architect's reading of AC-55, logged as a product-owner question. Today the same programme could not be recorded either.
  - **The send does not run `pointFaults`.** A contractor's file carries no planned-progress points, so NO_POINTS would refuse every
    send. The row is written with no points, and the points are entered by staff (below).
- **Staff enter the planned progress on a pinned row** (the act AC-55 left open). The act is `enterProgrammePoints` in
  `src/app/projects/[id]/exchange-actions.ts`. It is not a portal form: a contractor typing points is scope not ruled, and is not
  added.
  - **Reach and authority.** It starts with `exchangeReach`, and only a staff LEAD or REVIEWER passes. VIEWER and OVERSIGHT are
    refused (AC-52). The authority need is today's `submitProgramme` need, a staff TRANSACTION act, with no `recorderFaultToday`
    check. Points are a transcription of the contractor's file, not a judgement. The judgement is the scrutiny and the decision, which
    keep their checks. Keeping today's need, rather than inventing a stricter one, is logged.
  - **The checks.** The pure `pointFaults(points, possessionOn)` runs unchanged on the locked rows. The new pure
    `pinnedPointsFaults` (plan §3) refuses a row that is not pinned (the direct act owns those), a row already scrutinised or decided,
    a file that is not a `PROJECT_SUBMISSION_FILE` of the pinned revision, and a replacement without a reason.
  - **The source file is named.** The officer chooses the file of the revision the points were read from. The audit row records it.
  - **When.** The points may be entered, and replaced, only while the row has no scrutiny and no decision. The scrutiny judges the
    points it saw, and the decision approves the baseline the scrutiny judged.
  - **Replacing** swaps the whole set and needs a reason. The audit row carries the old set and the new one (a destructive change asks
    for a reason, and the before is never lost). Nothing downstream reads the points before approval: `programmeInForce` reads
    approved rows only.
  - **Locks.** Contract, then submission, then the pinned `WorkProgramme` row (`SELECT ... FOR UPDATE`, as `lockedRevision` does
    today). The recommendation and the answer on a pinned row take the same locks in the same order (D14). The write is guarded on `scrutinisedOn IS NULL AND decision IS NULL`. If the guard moves nothing, the act is refused
    as changed.
  - **Audit.** One UPDATE row on `WorkProgramme`, in the same transaction, with the planned progress before and after, written as the
    direct act writes it ("N% by day"), and the file it came from.
  - **On screen.** The points read "Entered by staff from the contractor's file", with the file's name. They are never shown as the
    contractor's own entry.
  - **No slot and no notice.** The act names no new `Person` column, so `act-slots.ts` gains no slot. The actor is on the audit row.
    No notice is written (AC-28 is a closed list).
  - **Paper revisions** (D10) use the same act.
- **On recommendation.** The register's recommendation on a pinned row runs `scrutinyFaults` unchanged, then writes the row's scrutiny
  fields in the same transaction: `scrutinisedBy`, `scrutinisedOn` and `reasonable`.
  - `reasonable` is true for a recommendation to approve (with or without comments), and false for one to revise or to reject.
  - **The need** is `{ act: "PROGRAMME_SCRUTINY" }`, as `answerNeeds` declares for a work programme's RECOMMEND step.
  - **The slot** is `WorkProgramme.scrutinisedBy`, kept as it is today: the officer's own entry, or recorded from paper.
  - **A recommendation to approve needs the points.** It is refused (NO_POINTS) while the row has none. This adds a check: points
    lock at scrutiny, so without it a row could be found reasonable with no points, and then neither be approved (`decideFaults`
    NO_POINTS) nor receive points. The added check is logged. A recommendation to revise or to reject needs no points.
- **On the final answer.** The answer act runs `decideFaults` unchanged, with the decision from `programmeDecisionFor`. Approved and
  Approved with comments write `APPROVED`, and Revise and resubmit and Rejected write `RETURNED`. So:
  - an approval is refused until the scrutiny is recorded and found reasonable (NOT_SCRUTINISED, FOUND_UNREASONABLE), and until the
    row has its points (NO_POINTS);
  - Revise and resubmit and Rejected need a written reason (REASON_REQUIRED);
  - the answer's comments go to `decisionNote`.
  - **The signature stays.** The answer keeps the `WorkProgramme.decidedBy` act slot (`signatureClass`, HOLDER_CHECKED), signed with
    the password or recorded from paper (ADR 0034 D12), as `decideProgramme` does today. Its `on` is the signed act's server day. The
    slot's `entryPoints` gain the register's answer act, and the act-slot scan is extended, never loosened.
  - The D4 and D5 needs apply as for any other type (`answerNeeds`).
- **No second writer.** For a pinned row, the direct supervision acts, record, scrutinise and decide, are refused with "Answer it in
  the Project register". They stay for unpinned rows recorded before the switch. Paper programmes come in through the register's
  paper-on-behalf path (D10), not the direct act.
- **What follows from the decision is unchanged.** EOT claims and the progress checks keep reading `WorkProgramme`.

**D10. Staff may record a paper revision on the contractor's behalf** (the spec's hybrid model, AC-26).
- The revision has `onBehalf = true`, the staff sender, and the day the paper was received.
- It reads "recorded from paper on the contractor's behalf" wherever it is shown.
- It is never presented as the contractor's signature, under ADR 0034 D12.
- A statutory declaration cannot be recorded this way. Its step-up is the contractor's own signature.
  - Today there is no staff path for it either: `sendSubmission` (`src/lib/portal/projects/submission-store.ts:71`) takes only a
    supplier actor. So nothing that exists is lost, and a declaration that arrives on paper stays outside the system, as it does today.
  - **Adopted, AC-59, as the one recorded exception to AC-26's paper-on-behalf.** No stage, payment or certificate reader takes a
    declaration row as its gate today (`declarationBlocking` has no producer), so nothing is lost.
  - **The paper form is never hidden.** For this type it says the declaration cannot be recorded from paper, and why: it needs the
    contractor's own signature.
  - **R-1 item 9** asks CPD whether a declaration lodged on paper must be recorded in the system. If yes, a holder of
    `acts.recordOnBehalf` records it with the paper reference, attributed as recorded on behalf and shown as not signed (ADR 0034
    D12), and AC-59 is revisited.

**D11. Files: owners, entitlement, bounds and scanning (extends ADR 0011).**
- **Owners and purposes.**
  - `DocumentAttachment` gains `projectSubmissionRevisionId?` and `projectMeetingId?`.
  - The purposes are `PROJECT_SUBMISSION_FILE`, `PROJECT_REVIEW_MARKUP` and `PROJECT_MEETING_MINUTES`.
  - The one-owner and purpose CHECKs are replaced whole, in one migration, with every existing owner kept.
  - The demo-wipe plan learns both owners.
- **What a contractor member may read** (AC-29, AC-50):
  - files on every revision its supplier sent on that contract, whoever sent it: a member account, a non-member account (ADR 0038
    D5), or staff on its behalf from paper (D10);
  - files on RSAJ_TO_CONTRACTOR revisions;
  - markups on SHARED comments on those revisions;
  - the kick-off minutes, which were sent to it under D12.
  It reads nothing else.
- **What a non-member account may read** (AC-50's narrowing): the files of the revisions its own account sent, and the markups on
  SHARED comments on those revisions. Nothing else: no colleague's revision, nothing RSAJ sent, no minutes.
- The pure `contractorMayRead` takes the member fact, the "sent by this account" fact and the "sent by this supplier" fact, with a
  test for each side (plan §3).
- **Download.** A new contractor download route logs each download as a `DocumentAccessEvent` with the supplier account as the actor.
  Contractors do not see the access log. Uploads are logged by their audit CREATE rows.
- **SULIT** is unchanged for staff (ADR 0034 D14).
  - **Sending to a contractor.** Sending a SULIT-class document to a contractor is refused while
    `ProjectExchangePolicy.sulitToContractor` is unset or false. **Adopted, AC-53.** The two refusals are never worded alike:
    - unset: the screen says the setting is **not set** (finding `SULIT_TO_CONTRACTOR_NOT_SET`);
    - false: the screen says **the organisation's setting refuses it** (finding `SULIT_TO_CONTRACTOR_REFUSED`).
    - The switch has its own provenance column, `sulitToContractorProvenance`.
  - **What counts as a send.** Every RSAJ_TO_CONTRACTOR revision, and the kick-off minutes (D12, AC-61 (c)).
  - **The contractor's own files.** A contractor reads back its own file whatever the class.
- **Bounds.**
  - The type's `allowedMediaTypes` and `maxBytes` narrow the organisation's store policy. They never widen it.
  - Types are sniffed from the content.
  - `ProjectExchangePolicy.perContractMaxBytes` bounds the contractor's uploads to one contract. While it is unset, contractor uploads
    are refused, and the screen says the setting is unset (AC-29). It has its own provenance column, `perContractMaxBytesProvenance`
    (AC-53).
- **Scanning.** Virus scanning stays a go-live condition (OD-4). Until then:
  - every version reads "not scanned";
  - staff download it as an attachment only.
- **Retention** comes from the type's document class.

**D12. The kick-off meeting is part of the exchange** (P-1, AC-24).
- **When.** Scheduling opens at EXECUTED, through a new act-status row in `src/lib/contract/act-status.ts`.
- **Who.** Scheduling and recording need the D4 check.
- **The record.**
  - Kick-off only.
  - The officer records attendance.
  - The online link is plain text.
  - The minutes are a `PROJECT_MEETING_MINUTES` attachment.
- **Attaching the minutes is a send to the contractor (AC-61 (c)).** AC-29 lets a contractor read only what it submitted or what RSAJ
  deliberately sent it. Contractor members read the minutes, so attaching them is that deliberate send. The attach act runs the D4
  check and `sendToContractorFaults`, so a SULIT-class minute is refused while `sulitToContractor` is not set, or set to refuse.
- **The briefing.** The FR-CON-010 briefing is written by the meeting only if it is missing. `briefingMissing`
  (`src/lib/contract/sign.ts:170`) is unchanged.

**D13. Notices (P-5, AC-28).**
- **A new table, `SupplierNotice`.**
  - It has a closed kind list mirrored by a CHECK, and the same unique key as `StaffNotice` (with the account in place of the person).
  - A trigger lets `readAt` change and nothing else.
  - It carries Part 2 kinds only. Read state is per account.
- **Staff kinds** join `StaffNotice` and its CHECK in the same migration as `src/lib/inbox/kinds.ts`.
- **Recipients are exactly AC-28's:**
  - submitted: the assigned reviewer, or else the S.O. holders;
  - passed on: the holders of the higher approver's need;
  - answered: the contractor Lead and the submitter;
  - RSAJ sent a document: every contractor member;
  - acknowledged: the staff sender;
  - overdue: the reviewer and the staff Lead, once per due day.
- **Overdue** is written when the register is read, with `occurrence` set to the due day (the STEP_ESCALATED precedent). A scheduler
  is a go-live item.
- **What a notice never carries:** a SULIT figure, or another contractor's name.
- **No other notices.** Meetings and team requests write none, because none was ruled. **Adopted, AC-57.** A pending team request is
  listed instead in the Project stage's team panel, to the staff who may decide it (ADR 0038 D6).
- **Retention:** kept, with no disposal (R-7).

**D14. Audit and locks.**
- Every act writes its audit row, with before and after, in its own transaction.
- The lock order is contract, then submission, then the pinned `WorkProgramme` row, then document (ADR 0038 D7). The points act, and
  the recommendation and the answer on a pinned programme, take the row lock as `lockedRevision` does today. Contractor acts never
  take the supplier row.
- A multi-file send stages each file through the upload route first, as ADR 0011 D5 requires. The send act then pins the staged
  versions, so the 60-second `storeUpload` transaction never holds the contract lock.

## Consequences

- **Easier:**
  - One register answers "who is it waiting on, and for how long", per contract and across contracts (the "Submissions waiting" view,
    with "assigned to me").
  - The programme has one source, and the EOT and progress code is unchanged.
  - A second customer's types, targets and answer sets are configuration.
- **Harder:**
  - Two records of contractor submissions coexist: the legacy rows, read-only, and the register. Every reader that counts them
    (overview counts, the payments claim list) reads both until the legacy rows age out of interest.
  - The `DocumentAttachment` CHECK replacement must list every existing owner and purpose exactly.
- **Ruled out:**
  - Withdrawing a revision.
  - Answering a rejected submission again.
  - An answer to the contractor from someone without the S.O. office or the contractor communication scope.
  - Copying the legacy service levels.
  - Money in JSON.
  - Contractor reads of internal comments, and of files RSAJ did not send.
- **Depends on CPD (R-1):** the day basis, SULIT to contractors, and the first document types with their targets, higher approver and
  answer set. Each has a default above that refuses rather than assumes.
