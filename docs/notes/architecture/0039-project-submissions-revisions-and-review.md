# 0039 — Project submissions, revisions and review

**Status:** Proposed, **held for CPD** (AC-7). Written on 2026-10-19 by the solution architect, at wave P step P0 of design note 0004.
Nothing here is built. No migration and no code follow until the founder records CPD's written sign-off of P-1 to P-7 as [NET-NEW] in
the decisions log, giving the signer's name, the date and the document version, together with the AC-7 policy answers (R-1 in
`docs/notes/plans/wave-p-build-plan.md` §7). The rulings behind this record are AC-24, AC-26 to AC-30 in design note 0004 §4. Table
shapes and pure signatures are declared in the build plan §2 and §3. If CPD's answers differ from the defaults below, this record is
amended before it is accepted.

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
- **Why both checks.** The second check under `PRINCIPAL_SO_REP` is the conservative reading. FR-SUP-004 requires the contractor
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
  - This is one column beyond design note §6.3. It is logged.
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
    This change is logged.
- **The declaration keeps its safeguards.** Its password step-up, `contractorSigningFaultOf` and its `ActAttribution` slot all stay.
- **The "sent on" day** is stamped by the server.
- **The legacy rows.** `ContractorSubmission` rows stay as the earlier record, shown read-only, so their `ActAttribution` rows keep
  resolving.
- **The bridge retires per kind.** The old send path for a kind closes only once its system type is issued. Until then, the old path
  takes that kind, so a contractual notice is never refused (AC-27, and ADR 0038 D5).
- **The interim claim's day.** Readers of the claim day, such as the `InterimValuation` CLAIM trigger, read both the legacy row and the
  register revision. P6 pins that with a test.

**D9. An approved work programme is the `WorkProgramme` record, written in the same act. There is one source of truth.**
- **On send.** When a revision of the WORK_PROGRAMME system type is sent, the same transaction writes a `WorkProgramme` row pinned to
  it by a new unique FK, `WorkProgramme.projectSubmissionRevisionId`.
  - Its `revision` is the next number for the contract (as today, unique per contract). The register letter is reached through the pin.
  - Its `submittedOn` is the revision's `sentOn`.
  - If one is open, its `ProgrammeDirection` is linked as the direct act links it today.
- **On recommendation.** The recommendation act writes the row's scrutiny fields in the same transaction: `scrutinisedBy`,
  `scrutinisedOn`, and `reasonable` (true for a recommendation to approve).
- **On the final answer.** The answer act writes `decision`. Approved and Approved with comments write `APPROVED`. Revise and resubmit
  and Rejected write `RETURNED`. The comments go to `decisionNote`.
- **No second writer.** For a pinned row, the direct supervision acts, record, scrutinise and decide, are refused with "answer it in
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
  - AC-26 names no exception, so this is the architect's carve-out, logged as a product-owner question. The alternative is to let a
    holder of `acts.recordOnBehalf` record it with the paper reference, attributed as recorded on behalf and shown as not signed
    (ADR 0034 D12).

**D11. Files: owners, entitlement, bounds and scanning (extends ADR 0011).**
- **Owners and purposes.**
  - `DocumentAttachment` gains `projectSubmissionRevisionId?` and `projectMeetingId?`.
  - The purposes are `PROJECT_SUBMISSION_FILE`, `PROJECT_REVIEW_MARKUP` and `PROJECT_MEETING_MINUTES`.
  - The one-owner and purpose CHECKs are replaced whole, in one migration, with every existing owner kept.
  - The demo-wipe plan learns both owners.
- **What a contractor member may read** (AC-29):
  - files on revisions it sent, including the on-behalf revisions of its own submissions;
  - files on RSAJ_TO_CONTRACTOR revisions;
  - markups on SHARED comments;
  - the kick-off minutes.
  It reads nothing else.
- **Download.** A new contractor download route logs each download as a `DocumentAccessEvent` with the supplier account as the actor.
  Contractors do not see the access log. Uploads are logged by their audit CREATE rows.
- **SULIT** is unchanged for staff (ADR 0034 D14).
  - **Sending to a contractor.** Sending a SULIT-class document to a contractor is refused while
    `ProjectExchangePolicy.sulitToContractor` is unset or false. The screen says the setting is unset. This is the conservative default
    while R-1 is open, and it is one column beyond §6.3, logged.
  - **The contractor's own files.** A contractor reads back its own file whatever the class.
- **Bounds.**
  - The type's `allowedMediaTypes` and `maxBytes` narrow the organisation's store policy. They never widen it.
  - Types are sniffed from the content.
  - `ProjectExchangePolicy.perContractMaxBytes` bounds the contractor's uploads to one contract. While it is unset, contractor uploads
    are refused, and the screen says the setting is unset (AC-29).
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
- **No other notices.** Meetings and team requests write none, because none was ruled.
- **Retention:** kept, with no disposal (R-7).

**D14. Audit and locks.**
- Every act writes its audit row, with before and after, in its own transaction.
- The lock order is contract, then submission, then document (ADR 0038 D7). Contractor acts never take the supplier row.
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
