# 0042 — The simple Project workspace: documents, versions, requests and optional approval

**Status:** Accepted for building, 2026-10-22. Written by the solution architect from the product owner's rulings PW-1 to PW-21
(decisions log, 2026-10-22). The build plan is `docs/notes/plans/project-workspace-simple-plan.md`.

**Supersedes** ADR 0038 and ADR 0039, and the wave P plan (`docs/notes/plans/wave-p-build-plan.md`). They are kept for their
reasoning and are not deleted. Design note 0004's rulings AC-7 and AC-24 to AC-30 are kept or replaced as PW-3 says. AC-49 to AC-61
are void, except AC-59.

**Relation to other records.**
- **Extends ADR 0011.** One new attachment owner and one new purpose are added. Files are immutable store versions, as before.
- **Uses ADR 0034** for the actors (staff `Person`, supplier account), the audit actor, act slots and SULIT reads.
- **Uses ADR 0037.** Reading a case follows `caseVisibility`.
- **ADR 0007 is unchanged.** The workspace hangs on the Contract row.

## Context

The founder asked for something simple: "Create document in project / can add approval afterward > upload document or request
document from vendor/RSAJ > RSAJ review or approved > if reject the respective party provided remarks, supplier resubmit > until
it approved that all. it should be simple no figure or anything."

The wave P design (ADR 0038 and ADR 0039) was built around configured document types, review targets, four answers, stored team
roles, a new supplier notice table and typed money fields. The founder's words rule most of that out. The founder gave the
go-ahead on 2026-10-22, and it replaces the AC-7 build gate (PW-1).

## Decision

**D1. Data model.** There are five new tables. Each carries `organisationId`, and every act writes its audit row with before and
after in the same transaction.

| Table | What it holds | Mutability |
| --- | --- | --- |
| `ProjectDocument` | contract, title, optional note, side, optional kind, creator | Insert only. The one exception: `kind` may be set once, from null. |
| `ProjectDocumentVersion` | number (1, 2, 3, shown as "Version 1"), optional note, uploader, server time and organisation day, whether the document had no approver at upload, the request it answers | Append-only |
| `ProjectDocumentRequest` | the side asked, optional note, who asked, when | Append-only. It is open while no version names it. |
| `ProjectDocumentApprover` | the named person, who added them, when | Insert, plus one removal set once, with a reason |
| `ProjectDocumentDecision` | version, approver (null for a kind), outcome (APPROVED, REJECTED, TAKEN_UP or RETURNED), remarks, who decided, when | Append-only |

- **Side.** A document's **side** (CONTRACTOR or ORGANISATION) is the side its versions come from. It is the creator's side when the
  creator uploads first, and the other side when the creator asks for it. It never changes. A document is created together with its
  first version or its first request, so no empty document exists.
- **State.** A document's state is never stored. It is derived by one pure function from the latest version, the open request, the
  live approvers and the decisions (PW-12).
- **Files.** A version's files are `DocumentAttachment` rows. They use the new owner `projectDocumentVersionId` and the new purpose
  `PROJECT_DOCUMENT_FILE`. Each pins an immutable store version.
  - The one-owner and purpose CHECKs are replaced whole, and a migration test lists every owner.
  - The store's own `DocumentVersion.versionNo` is not the project version number.
  - The kick-off minutes are an ordinary project document (D10). So there is no meeting owner, no minutes purpose and no markup
    purpose.
- **Enforced by triggers.** Append-only and write-once are enforced by database triggers, as for `DocumentVersion` and `StaffNotice`.
  The act's guarded write comes first; the trigger is the backstop.

**D2. Authority (PW-5, PW-6).**
- **The contractor's side** is every active portal account of the awardee (`supplierHoldsContract`).
- **The organisation's side.** A person acts for the organisation only if, on the organisation's today, they:
  - hold the S.O. office, or act in it; or
  - are a representative whose delegation includes `CONTRACTOR_COMMUNICATION`.
  This is checked at every act with `recorderFaultToday {act: CONTRACTOR_COMMUNICATION}`, as `answerContractorSubmission` does
  today. Other staff who can see the case read only.
- **Approvers** are named people. Each must pass the same check on the day they are added and again on the day they decide.
  - Only the organisation's side adds them, at creation or at any time before approval.
  - All live approvers must approve the current version. One rejection sends it back.
  - An approver may not decide a version they uploaded.
  - An approver may be removed, with a reason, before deciding the current version. A removal that would leave no approver, or would
    leave everyone still on the document having approved, is refused.
  - Approvals never carry over to a new version.
  - Approved is final: a later change is a new document.
- **Answers (PW-7).**
  - Approve, with optional remarks.
  - Reject, with required remarks written by the rejecting approver.
  - A rejection asks the document's side for a new version.
- **Slots.** Each act that writes a `Person` column takes an act slot. The act-wiring scan is extended, never loosened.

**D3. Who sees what (PW-8).** Contractor visibility is one pure function.
- **On a CONTRACTOR document**, the contractor sees every version, every decision and every remark.
  - The portal names the organisation, not the officer who decided.
- **On an ORGANISATION document**, the contractor sees:
  - a version uploaded with no approver on the document, which is shared for information at once;
  - a version uploaded with approvers, only once it is approved.
  - Until then, the document shows its title and "Being prepared by {organisation}".
  - Remarks on the organisation's own versions are staff-only.
  - The snapshot `noApproversAtUpload` decides the first case. Adding an approver later never hides a version already shared.
- **What the contractor never sees:** another contractor's documents (404) and the access log.
- **No acknowledge step.**

**D4. The six kinds (PW-9, PW-10).**
- **What the kinds are.** `kind` reuses the existing `ContractorSubmissionKind`: work programme, interim claim, materials list,
  delay notice, defects rectified, statutory declaration.
  - It is only on a CONTRACTOR document. The contractor picks it at its first version.
- **No approvers.** A document with a kind takes no approvers and is never Approved. A person with D2 authority marks its current
  version:
  - "Taken up", with a link to the tab where it is recorded (Site › Programme, Payments or Time); or
  - "Returned", with remarks, which asks for a new version.
  - Both are `ProjectDocumentDecision` rows with no approver. A trigger refuses APPROVED or REJECTED on a document with a kind, and
    TAKEN_UP or RETURNED on one without.
- **No figures.** No amount, day or materials line is captured; the files carry them. Officers key the claim day, the delay
  notice's days and material lines on their own tabs, as today.
- **Delay notice.** It is received with the server's timestamp (FR-EOT-001).
- **Defects rectified** is received only, never read as acceptance.
- **Statutory declaration.** It keeps the password step-up and `contractorSigningFaultOf`. It is never recorded from paper (AC-59).
- **FR-SUP-006.** The work programme's scrutiny and approval stay the existing `WorkProgramme` acts.

**D5. Legacy rows (PW-11).**
- `ContractorSubmission` rows stay read-only and are not migrated. They appear in the same Documents list, marked as earlier records,
  with their stored answer and fields.
- An unanswered legacy row stays answerable through the existing act.
- The old portal send path closes in the same step that lets the contractor pick a kind on the new upload (plan, step 6).
- **Renames** (tab ids unchanged):
  - the Project-stage tab "Submissions" becomes "Documents";
  - the existing "Documents" tab becomes "Certificates";
  - the portal's "Submissions" becomes "Documents";
  - `/projects` "Submissions waiting" becomes "Documents waiting", which reads both sources and has a "Waiting for me" filter.

**D6. Notices (PW-13).**
- **Staff inbox only.** Three new closed `StaffNotice` kinds are added, with `kinds.ts` and the CHECK changed together:
  - to each approver, when a version waits on them;
  - to the S.O. office's holders and acting holders, when the contractor uploads a document or a version;
  - to the same people, when the contractor asks for a document.
- **The contractor** gets no `SupplierNotice`, and the bell stays off. A derived "Waiting for you" list on the portal home and the
  project page shows requests to the contractor and its returned or rejected documents.
- No overdue notice and no email. No new notice table, so NFR-RET stays open as before.

**D7. Files and class (PW-14).**
- **The store.** Every file goes through the document store: type sniffed from content, `DocumentStorePolicy.allowedMediaTypes` and
  `maxBytes` (unset accepts nothing). Retention comes from the class.
- **The class.** A new `DocumentStorePolicy.projectDocumentClassId` names the class every project file takes.
  - It is saved through "Save the upload rules" on the two-person path, as `onlineBidFileClassId` is.
  - It is unset by default. While unset, creating and uploading are blocked, and the screen names the setting.
  - The editor refuses a SULIT or unclassified class.
- **Downloads.**
  - Each download re-checks the document's current classification and its class's current classification. It refuses a contractor
    once either is SULIT or unset.
  - Every download writes a `DocumentAccessEvent`, with the supplier account as the actor for a contractor.
  - Staff download as an attachment, and every version reads "not scanned".
- **Uploads.** Uploads are logged by their audit rows.

**D8. Bounds and locks (PW-15).**
- **Technical constants, not customer policy** (the `SUBMISSIONS_PER_WINDOW` precedent):
  - the most files in one version;
  - the most files, and the most bytes, one portal account may stage in a rolling window.
  The values and their reasons are in the plan. Bytes live in Postgres (ADR 0011 D1) and are never deleted, so the window bound
  protects the database.
- **Staging first.** Files are staged first, by an upload route, outside any contract lock.
- **The act pins the files.** The act that creates a version then takes the contract lock, then the document row, and pins the staged
  files. It refuses a staged file that:
  - was not staged for a project document;
  - was not staged by the same actor;
  - is already attached;
  - is not of the configured class.
- `storeUpload` never runs under the contract lock.

**D9. Team (PW-16, PW-17).**
- **No team table.** There are no stored members, no roles and no oversight permission.
- **The organisation's side** is the S.O. holders, the acting holders and the representatives in force. Acting needs D2. Reading
  follows `caseVisibility`.
- **The contractor's side** is every active portal account of the awardee. Accounts are opened only by staff
  (`supplierAccounts.manage`, the D6 identity check of ADR 0034).
- **On screen.**
  - The Team tab gains a read-only list of the contractor's active portal accounts. Contact details stay behind the existing SULIT
    read.
  - The portal shows the S.O. and the representatives in force, with their offices, read-only.
- **Deferred to the backlog:** per-contract contractor membership and the Lead's in-portal requests.

**D10. Kick-off meeting (PW-18).**
- **One per contract, from EXECUTED.** It is a new `KickOffMeeting` row, with attendance rows.
- **The acts**, each under D2 authority:
  - schedule it: date and time, a place or a plain-text online link, and an agenda;
  - change it before it is held, audited before and after;
  - record it held: attendance ticked from both sides plus other names, and the minutes uploaded as a project document shared for
    information.
- **The briefing.** The meeting does not write the Integrity Pact briefing. While the briefing is missing (`briefingMissing`,
  unchanged), the meeting card links to the existing briefing act.
- **Not built:** RSVP, calendar files and routine meetings.

**D11. When the workspace is open.** A new act-status row, `PROJECT_WORKSPACE`, in `src/lib/contract/act-status.ts`.
- It is allowed from EXECUTED (EXECUTED, STAMPED, ACTIVE) through PRACTICALLY_COMPLETE, MAKING_GOOD_COMPLETE,
  FINAL_CERTIFICATE_ISSUED and TERMINATED.
- It is refused before execution, when cancelled and when closed.
- Reading is never refused by it.

## Consequences

- **Easier:**
  - One list per contract answers "what is it, and who is it waiting on" in words.
  - The workspace needs one configuration value. A second customer is a class choice, not a type catalogue.
- **Harder:**
  - Two records of contractor submissions coexist until the legacy rows stop mattering. "Documents waiting" and the overview counts
    read both.
  - The attachment CHECK replacement must list every existing owner exactly.
- **Ruled out:**
  - Document numbers, revision letters, review targets, due days, overdue, charts and per-file comments.
  - "Approved with comments", final rejection and withdrawal.
  - A supplier notice table.
  - A stored team.
  - SULIT files to contractors.
  - Recording a statutory declaration from paper.
- **Go-live condition (PW-1).** CPD's written acceptance of the workspace as [NET-NEW] (scope register row 26: signer, date,
  document version) is recorded before it is used with the customer's contractors in production. It is never inferred from a
  configuration value.
