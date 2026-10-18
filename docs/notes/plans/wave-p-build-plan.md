# Wave P — the Project workspace (Part 2): build plan

**Status (2026-10-19): Proposed, HELD for CPD (AC-7). Not built, and not to be started.** This is wave P step P0 of design note 0004,
written by the solution architect. It sits alongside ADR 0038 and ADR 0039, which hold the decisions. The plan declares contracts; it is not code. The Prisma
blocks in §2 and the signatures in §3 are **declarations for the builders**: no migration is written and no file under `prisma/` or
`src/` changes until the entry gate below is met.

**Entry gate for P1 onward. No step starts until all three are true:**
1. The decisions log records CPD's **written** sign-off of P-1 to P-7 as [NET-NEW], with the signer's name, the date and the document
   version (AC-7; scope register row 26).
2. The log records CPD's answers to the R-1 items in §7, or records that the founder keeps the stated default for each.
3. The product owner has reviewed ADR 0038 and ADR 0039 as "proposed, held", and has ruled on the questions in §6, or adopted their
   defaults.

If CPD declines Part 2, this plan is closed unbuilt, and wave V may start (AC-35, AC-48).

**Sources.**
- **Requirement:** P-1 to P-7 in `docs/requirements/award-contract-v2-media/Award_and_Contract_Requirements_v2.txt` (lines 221–290).
- **Rulings:** AC-7 and AC-24 to AC-30 in `docs/notes/design/0004-award-contract-requirements-v2.md` §4. Section 6.3 of that note is the
  sketch that §2 below makes exact.
- **ADRs:**
  - `docs/notes/architecture/0038-contract-teams-and-access-to-the-project-exchange.md`
  - `docs/notes/architecture/0039-project-submissions-revisions-and-review.md`
  - Read with ADR 0011 (documents), ADR 0034 (sign-in, permissions, SULIT) and ADR 0037 (the case page).
- **Spec:** FR-SUP-004, FR-SUP-006, FR-CON-009, FR-CON-010, FR-EOT-001, FR-SUP-009, NFR-RET.

**What holds the files meanwhile.** The C-2 Project stage keeps today's tabs, and the MN-02 submissions bridge stays (AC-7).

## 0. What exists today

| Need | State | Where |
| --- | --- | --- |
| Contractor reach to a contract | every active account of the awardee, for a standing award | `supplierHoldsContract`, `src/lib/portal/projects/visibility.ts:17-19` |
| Staff reach to a case | per surface | `caseVisibility` (ADR 0037) |
| S.O. office and delegates | exists; scope by `SupervisionAct`, `CONTRACTOR_COMMUNICATION` among them | `ContractSoAssignment`, `SoDelegation`, `SoDelegationScope`; `soOfficeOn` (`src/lib/supervision/load.ts:75`) |
| Authority checked at the act | exists | `recorderFaultToday` (`load.ts:88`); `ActNeed` = `{act}` \| `{soOnly}` \| `{principalOrSo}` (`src/lib/supervision/authority.ts:44`) |
| Opening a supplier account, D6 check | exists | `openSupplierAccount` (`src/lib/auth/supplier-administration.ts:79`); `supplierAccounts.manage` (GRANT_ONLY) |
| Supplier row lock | exists | `withLockedSupplier` (`src/lib/suppliers/write.ts:44`) |
| Contract lock | exists | `withLockedContract` |
| Contractor submissions | six kinds, text only, one answer | `ContractorSubmission` (`schema.prisma:12908`), `KIND_SHAPE` (`src/lib/portal/projects/submission.ts:45`), `sendSubmission` (`submission-store.ts:71`), `answerContractorSubmission` (`src/app/documents/review-actions.ts:34`) |
| Service level per kind | exists, unset means no due day | `ContractorSubmissionSetting` |
| Work programme record | exists; scrutiny `{act: PROGRAMME_SCRUTINY}`, decision `{principalOrSo}`; decision APPROVED \| RETURNED | `WorkProgramme` (`schema.prisma:10813`); `src/app/projects/[id]/supervision-actions.ts:392`, `:423` |
| Immutable document versions, owner FKs, purposes | exists; `contractId` is already an owner | `DocumentAttachment` (`schema.prisma:4662`), `AttachmentPurpose` (`:4450`), `src/lib/documents/**` |
| Retention from the class | exists, unset means "not set" | `DocumentClass.retentionMonths` |
| Holiday calendar | exists | `HolidayCalendar`, `PublicHoliday` |
| Staff notices | closed kinds, CHECK, readAt-only | `StaffNotice` (`schema.prisma:12828`), `src/lib/inbox/kinds.ts` |
| Supplier notices | **none**; the bell is off | `src/components/shell/topbar.tsx` |
| Kick-off meeting | **none**; the briefing is recorded at signing | `IntegrityBriefing`; `briefingMissing` (`src/lib/contract/sign.ts:170`) |
| Contract act-status table | exists | `ACT_STATUS` in `src/lib/contract/act-status.ts` |

## 1. Target behaviour

ADR 0038 (D1 to D9) and ADR 0039 (D1 to D14) are the behaviour. This plan does not restate them. Where a step below says "per D*n*",
the ADR text is the acceptance criterion.

## 2. Data model: declarations only (one migration per step, written at that step)

Every table carries `organisationId`. Every act writes its audit row, with before and after, in the same transaction. The lock order is
supplier (only the D6 request approval), then contract, then submission, then document. The names and shapes below are the contract
between the data-modeler and the engineers. A builder who needs to change one raises it with the architect first.

```prisma
// ---------- P1: teams (ADR 0038)
enum TeamSide { STAFF CONTRACTOR }
enum TeamRole { LEAD REVIEWER SUBMITTER VIEWER }
enum TeamRequestStatus { PENDING APPROVED REFUSED }

model ContractTeamMember {
  id                       String   @id @default(cuid())
  organisationId           String
  contractId               String
  side                     TeamSide
  personId                 String?  // side STAFF
  supplierAccountId        String?  // side CONTRACTOR
  role                     TeamRole
  addedByPersonId          String?
  addedBySupplierAccountId String?
  addedAt                  DateTime
  removedAt                DateTime?
  removedByPersonId        String?
  removedBySupplierAccountId String?
  removeReason             String   @default("")
  @@index([contractId])
  // SQL in the migration:
  //   CHECK exactly one of personId / supplierAccountId, matching side
  //   CHECK role <> 'REVIEWER' OR side = 'STAFF'
  //   CHECK role <> 'SUBMITTER' OR side = 'CONTRACTOR'
  //   partial UNIQUE (contractId, personId) WHERE removedAt IS NULL AND personId IS NOT NULL
  //   partial UNIQUE (contractId, supplierAccountId) WHERE removedAt IS NULL AND supplierAccountId IS NOT NULL
  // S.O. holders and delegates are derived (ADR 0038 D2), never rows here.
}

model ContractTeamRequest {
  id                           String   @id @default(cuid())
  organisationId               String
  contractId                   String
  requestedBySupplierAccountId String
  requestedAt                  DateTime
  proposedName                 String   // SULIT, supplier scope (ADR 0038 D6)
  designation                  String
  email                        String   // SULIT
  phone                        String   // SULIT
  proposedRole                 TeamRole // SUBMITTER | VIEWER | LEAD; CHECK not REVIEWER
  status                       TeamRequestStatus
  decidedByPersonId            String?
  decidedAt                    DateTime?
  identityCheck                String   @default("") // D6, required on APPROVED
  reason                       String   @default("") // required on REFUSED
  resultContactId              String?
  resultAccountId              String?
  @@index([contractId, status])
  // write-once trigger: status leaves PENDING once, and the decision columns are set with it
}

// ---------- P2: types, register policy (ADR 0039 D3, D5, D7, D11)
enum ProjectAnswerSet { FOUR TAKEN_UP_RETURNED ACKNOWLEDGE }
enum HigherApproval { NONE PRINCIPAL_SO_REP SO_OFFICE }
enum ReviewDayBasis { CALENDAR WORKING }
enum SubmissionDirection { CONTRACTOR_TO_RSAJ RSAJ_TO_CONTRACTOR }

model ProjectDocumentType {
  id                String   @id @default(cuid())
  organisationId    String
  code              String   // configuration key, never shown
  nameEn            String
  nameMs            String
  documentClassId   String
  reviewDays        Int?     // null with reviewTargetSet = true means "no target"
  reviewTargetSet   Boolean  @default(false)
  answerSet         ProjectAnswerSet
  higherApproval    HigherApproval? // null = unset; refused at issue (AC-27)
  allowedMediaTypes String[]
  maxBytes          BigInt?
  directions        SubmissionDirection[]
  systemKind        ContractorSubmissionKind? // P6: the six system types
  sortOrder         Int
  retiredOn         DateTime?
  provenance        Provenance?
  @@unique([organisationId, code])
  // partial UNIQUE (organisationId, systemKind) WHERE systemKind IS NOT NULL
  // CHECK reviewDays IS NULL OR reviewDays > 0
}

model ProjectExchangePolicy {
  id                  String          @id @default(cuid())
  organisationId      String          @unique
  perContractMaxBytes BigInt?         // null refuses contractor uploads, "not set" (AC-29)
  reviewDayBasis      ReviewDayBasis? // null reads CALENDAR, shown ASSUMED (AC-27); beyond §6.3, logged
  sulitToContractor   Boolean?        // null or false refuses sending SULIT to a contractor; beyond §6.3, logged
  provenance          Provenance?
}

// ---------- P3: submissions (ADR 0039 D1 to D6, D10, D11)
enum SubmissionIntent { REVIEW FOR_INFORMATION ACKNOWLEDGE }
enum ProjectAnswer { APPROVED APPROVED_WITH_COMMENTS REVISE_AND_RESUBMIT REJECTED TAKEN_UP RETURNED ACKNOWLEDGED }
enum CommentVisibility { SHARED INTERNAL }

model ProjectSubmission {
  id             String   @id @default(cuid())
  organisationId String
  contractId     String
  seq            Int      // shown as SUB-0001
  typeId         String
  title          String
  direction      SubmissionDirection
  intent         SubmissionIntent
  createdAt      DateTime
  closedAt       DateTime?
  @@unique([contractId, seq])
}

model ProjectSubmissionRevision {
  id                      String   @id @default(cuid())
  organisationId          String
  submissionId            String
  index                   Int      // 1-based; letter = revisionLetter(index)
  sentByPersonId          String?
  sentBySupplierAccountId String?
  onBehalf                Boolean  @default(false)
  paperReceivedOn         DateTime? // required when onBehalf
  sentAt                  DateTime
  sentOn                  DateTime  // organisation day, server-stamped
  reviewerPersonId        String?
  reviewDays              Int?      // snapshot
  reviewDayBasis          ReviewDayBasis? // snapshot
  dueOn                   DateTime? // snapshot
  recommendation          ProjectAnswer?
  recommendedByPersonId   String?
  recommendedAt           DateTime?
  passedOnAt              DateTime?
  answer                  ProjectAnswer?
  answeredByPersonId      String?
  answeredAt              DateTime?
  answeredOn              DateTime?
  acknowledgedBySupplierAccountId String?
  acknowledgedAt          DateTime?
  @@unique([submissionId, index])
  // CHECK exactly one of sentByPersonId / sentBySupplierAccountId
  // CHECK onBehalf = false OR (sentByPersonId IS NOT NULL AND paperReceivedOn IS NOT NULL)
  // write-once trigger: recommendation, passedOnAt, answer, acknowledgement each set once
}

model ProjectSubmissionComment {
  id                      String   @id @default(cuid())
  organisationId          String
  revisionId              String
  attachmentId            String?  // a file of the revision, or the markup itself
  authorPersonId          String?
  authorSupplierAccountId String?
  visibility              CommentVisibility
  body                    String   @db.Text
  at                      DateTime
  // append-only trigger; CHECK INTERNAL only with authorPersonId
}

// ---------- P5: the kick-off meeting (ADR 0039 D12)
enum ProjectMeetingKind { KICK_OFF }
enum ProjectMeetingStatus { SCHEDULED HELD CANCELLED }

model ProjectMeeting {
  id             String   @id @default(cuid())
  organisationId String
  contractId     String
  kind           ProjectMeetingKind
  scheduledAt    DateTime
  place          String   @default("")
  onlineLink     String   @default("") // plain text
  agenda         String   @db.Text
  status         ProjectMeetingStatus
  heldOn         DateTime?
  cancelReason   String   @default("")
  // partial UNIQUE (contractId, kind) WHERE status <> 'CANCELLED'
}

model ProjectMeetingAttendance {
  id                String   @id @default(cuid())
  organisationId    String
  meetingId         String
  side              TeamSide
  personId          String?
  supplierAccountId String?
  name              String   @default("") // someone with no row on either side
  attended          Boolean?
}

// ---------- P4: notices (ADR 0039 D13)
model SupplierNotice {
  id                         String   @id @default(cuid())
  organisationId             String
  supplierId                 String
  recipientSupplierAccountId String
  kind                       String   // closed list + CHECK
  subjectEntity              String
  subjectId                  String
  occurrence                 String   @default("")
  contractId                 String?
  title                      String
  body                       String
  href                       String?
  raisedByPersonId           String?
  raisedBySupplierAccountId  String?
  raisedAt                   DateTime @default(now())
  readAt                     DateTime?
  @@unique([organisationId, recipientSupplierAccountId, kind, subjectEntity, subjectId, occurrence])
  // trigger: only readAt may change
}

// ---------- P6: the six kinds' typed details (ADR 0039 D8; replaces §6.3's `detail Json?`)
model ProjectSubmissionClaimDetail {
  revisionId String   @id
  amount     Decimal? @db.Decimal(18, 2)
  aboutDay   DateTime?
}
model ProjectSubmissionMaterialLine {
  id          String  @id @default(cuid())
  revisionId  String
  sortOrder   Int
  description String
  quantity    String
  location    String
  value       Decimal @db.Decimal(18, 2)
  @@unique([revisionId, sortOrder])
}

// ---------- changes to existing models
// DocumentAttachment: + projectSubmissionRevisionId String?, + projectMeetingId String?
//   AttachmentPurpose: + PROJECT_SUBMISSION_FILE, PROJECT_REVIEW_MARKUP, PROJECT_MEETING_MINUTES
//   the one-owner and purpose CHECKs are dropped and re-created whole, listing every existing owner (P3, P5)
// WorkProgramme: + projectSubmissionRevisionId String? @unique (P6, ADR 0039 D9)
// StaffNotice kind CHECK: + PROJECT_SUBMISSION_SENT, PROJECT_SUBMISSION_PASSED_ON, PROJECT_DOCUMENT_ACKNOWLEDGED,
//   PROJECT_SUBMISSION_OVERDUE (P4)
// SupplierNotice kinds: PROJECT_SUBMISSION_ANSWERED, PROJECT_DOCUMENT_SENT (P4)
```

All relations, `onDelete: Restrict`, follow the house pattern and are written by the data-modeler at each step. Money is `Decimal`.
Days are organisation days stored as `DateTime` at midnight UTC, as elsewhere.

## 3. Pure contracts (each file has a `.test.ts`; the domain-engineer writes the signatures verbatim)

```ts
// src/lib/project-docs/team.ts (P1)
export type ExchangeRole = "LEAD" | "REVIEWER" | "SUBMITTER" | "VIEWER" | "OVERSIGHT";
export type TeamRefusal = "NOT_ON_TEAM" | "ACCOUNT_NOT_ACTIVE" | "ADMINISTRATOR" | "OVERSIGHT_UNDECIDED" | "OVERSIGHT_WITHHELD" | "NOT_THE_AWARDEE";
export interface StaffTeamFacts {
  personId: string; isAdministratorActing: boolean;
  soHolderToday: boolean;                       // holder or acting holder, organisation's today
  delegationScopesToday: readonly SupervisionAct[][]; // one entry per in-force delegation
  storedRole: "LEAD" | "REVIEWER" | "VIEWER" | null;
  oversight: "GRANTED" | "WITHHELD" | "UNDECIDED";
}
export interface ContractorTeamFacts {
  accountActive: boolean; holdsContract: boolean; // supplierHoldsContract
  storedRole: "LEAD" | "SUBMITTER" | "VIEWER" | null;
}
export function staffExchangeRole(f: StaffTeamFacts): { role: ExchangeRole } | { refused: TeamRefusal };
export function contractorExchangeRole(f: ContractorTeamFacts): { role: ExchangeRole } | { refused: TeamRefusal };
/// ADR 0038 D5: the six system types may be sent by a non-member account that holds the contract.
export function maySendSystemType(f: ContractorTeamFacts): boolean;
export function removeMemberFaults(i: { actorRole: ExchangeRole | null; actorSide: TeamSide; target: { side: TeamSide; role: TeamRole }; liveContractorLeads: number; reason: string }): Finding[];
export function requestFaults(i: { proposedName: string; designation: string; email: string; phone: string; proposedRole: TeamRole }): Record<string, Fault>;

// src/lib/project-docs/reach.ts (P1; a reader, not pure)
export async function exchangeReach(reader: Reader | SupplierActor, contractId: string, client?: Tx): Promise<{ role: ExchangeRole } | { refused: TeamRefusal }>;

// src/lib/project-docs/revision.ts (P2)
/// 1 → "A", 26 → "Z", 27 → "AA", 52 → "AZ", 53 → "BA". Throws below 1 or on a non-integer.
export function revisionLetter(index: number): string;
export const submissionNumber = (seq: number) => `SUB-${String(seq).padStart(4, "0")}`;

// src/lib/project-docs/state.ts (P2)
export type SubmissionState = "WAITING_ON_RSAJ" | "WITH_HIGHER_APPROVER" | "WAITING_ON_CONTRACTOR" | "APPROVED" | "CLOSED" | "REJECTED" | "FOR_INFORMATION";
export interface RevisionFacts { direction: SubmissionDirection; intent: SubmissionIntent; answerSet: ProjectAnswerSet; recommendation: ProjectAnswer | null; passedOn: boolean; answer: ProjectAnswer | null; acknowledged: boolean }
export function submissionState(latest: RevisionFacts): SubmissionState;
export function answerFaults(set: ProjectAnswerSet, answer: ProjectAnswer): Finding[];         // answer outside its set
export function nextRevisionFaults(latest: RevisionFacts): Finding[];                          // only after REVISE_AND_RESUBMIT

// src/lib/project-docs/clock.ts (P2)
export function dueOnFor(sentOn: Day, days: number | null, basis: ReviewDayBasis, holidays: ReadonlySet<Day>): Day | null;
export function waitingOnRsaj(r: RevisionFacts): boolean;
export function isOverdue(r: RevisionFacts & { dueOn: Day | null }, today: Day): boolean;      // false unless waitingOnRsaj
export function daysWaiting(sentOn: Day, until: Day, basis: ReviewDayBasis, holidays: ReadonlySet<Day>): number;
export const effectiveBasis = (b: ReviewDayBasis | null): { basis: ReviewDayBasis; provenance: Provenance | "ASSUMED" } => …; // null → CALENDAR, ASSUMED

// src/lib/project-docs/authority.ts (P3)
/// ADR 0039 D4 and D5. Every need listed must be met by the actor on the act's day.
export function answerNeeds(higher: HigherApproval, step: "RECOMMEND" | "ANSWER", isWorkProgramme: boolean): readonly ActNeed[];
//   NONE, ANSWER                 → [{act: "CONTRACTOR_COMMUNICATION"}]
//   PRINCIPAL_SO_REP or SO_OFFICE, RECOMMEND → isWorkProgramme ? [{act: "PROGRAMME_SCRUTINY"}] : []  (a team REVIEWER; it is then passed on)
//   PRINCIPAL_SO_REP, ANSWER     → [{principalOrSo: true}, {act: "CONTRACTOR_COMMUNICATION"}]
//   SO_OFFICE, ANSWER            → [{soOnly: true}]
//   NONE, RECOMMEND              → []  (a team REVIEWER; a recommendation is never an answer)

// src/lib/project-docs/type-issue.ts (P2)
export function typeIssueFaults(t: { reviewTargetSet: boolean; reviewDays: number | null; higherApproval: HigherApproval | null; documentClassId: string | null; directions: readonly SubmissionDirection[]; answerSet: ProjectAnswerSet; systemKind: ContractorSubmissionKind | null }): Finding[];
//   refuses: target unset; higher approval unset; no class; no direction; a system kind with the wrong answer set (AC-30)

// src/lib/project-docs/entitlement.ts (P3)
export function contractorMayRead(f: { purpose: AttachmentPurpose; revisionSentByThisSupplier: boolean; direction: SubmissionDirection; commentVisibility: CommentVisibility | null }): boolean;
export function contractorUploadFaults(f: { perContractMaxBytes: bigint | null; usedBytes: bigint; incomingBytes: bigint; typeMaxBytes: bigint | null; mediaType: string; allowed: readonly string[] }): Finding[];
export function sendToContractorFaults(f: { classIsSulit: boolean; sulitToContractor: boolean | null }): Finding[];

// src/lib/project-docs/notices.ts (P4)
export type ExchangeEvent = "SUBMITTED" | "PASSED_ON" | "ANSWERED" | "RSAJ_SENT" | "ACKNOWLEDGED" | "OVERDUE";
export function recipientsFor(e: ExchangeEvent, f: { reviewerPersonId: string | null; soHolderIds: readonly string[]; higherHolderIds: readonly string[]; staffLeadIds: readonly string[]; contractorLeadAccountIds: readonly string[]; submitterAccountId: string | null; contractorMemberAccountIds: readonly string[]; staffSenderPersonId: string | null }): { staff: string[]; supplierAccounts: string[] };

// src/lib/project-docs/meeting.ts (P5)
export function scheduleFaults(f: { contractStatus: ContractStatus; liveKickOff: boolean; scheduledAt: Date | null; agenda: string; place: string; onlineLink: string }): Finding[];
export const writesBriefing = (briefingExists: boolean) => !briefingExists;

// src/lib/project-docs/programme.ts (P6, ADR 0039 D9)
export function programmeDecisionFor(answer: ProjectAnswer): ProgrammeDecision; // APPROVED[_WITH_COMMENTS] → APPROVED; REVISE_AND_RESUBMIT, REJECTED → RETURNED
```

Labels for every enum value get English and Malay in `src/lib/project-docs/labels.ts`. Codes and `code` columns never reach a screen.

## 4. Acts, reads and routes

- **Staff acts** go in `src/app/projects/[id]/exchange-actions.ts`: add or remove a member, set the contractor Lead, decide a request,
  assign a reviewer, comment, recommend, pass on, answer, send to the contractor, record paper on behalf, schedule, record and cancel a
  meeting.
  - Each act begins with `exchangeReach`, then takes the locks in order, re-runs the pure check on the locked rows, and writes with its
    audit row.
  - Each act gets an act-slot entry (`src/lib/auth/act-slots.ts`). The `act-wiring-scan.test.ts` pin is extended, never loosened.
- **Portal acts:**
  - Submit is `POST /supplier/projects/[id]/exchange/submit`. It is a Route Handler, because files are staged first (ADR 0011 D5).
  - Acknowledge, comment, request a member and remove a member are server actions in `src/app/supplier/projects/[id]/`.
  - The contractor download is `GET /supplier/projects/[id]/exchange/file/[attachmentId]`. It logs a `DocumentAccessEvent` with the
    supplier actor.
- **Reads:**
  - `src/lib/project-docs/register.ts` is the register reader. Its filters (Waiting on RSAJ, Waiting on contractor, Approved, Overdue)
    are WHERE clauses, and it is paged in the database.
  - The cross-contract view is the "Submissions waiting" view on `/projects`, with "Assigned to me".
  - Portal stores never select an INTERNAL comment.
- **Configuration:** the Project document types editor under `src/app/configuration/`, through ConfigurationChange. New policy kinds
  are added in `src/lib/auth/configuration-change-words.ts`. The `ProjectExchangePolicy` editor goes in the same section.

## 5. Steps (P0 is this record; P1 to P7 wait for the entry gate)

**P1. data-modeler, then api-engineer: teams and access** (ADR 0038).
- The migration adds `ContractTeamMember`, `ContractTeamRequest` and their CHECKs, partial uniques and trigger.
- The backfill gives a contractor LEAD to each account that is ACTIVE at migration time, on each contract `supplierHoldsContract`
  gives it. The backfill's SQL mirrors the pure rule, and a db test compares the two.
- Add the `projects.exchange.oversee` key in `src/lib/auth/permissions.ts`: GRANT_ONLY, en and ms words as in ADR 0038 D3.
- Write `team.ts`, `reach.ts` and the request → approve act (supplier lock, then contract lock, then `openSupplierAccount`).
- Register the SULIT fields of `ContractTeamRequest` with the supplier scope in `src/lib/auth/sulit-access.ts`.
- The portal `context-store` and `list-store` keep today's reach. Only exchange stores call `exchangeReach`.
- **Done when db-tested:**
  - backfill parity: every account sees what it saw;
  - a removed member loses the exchange on the next request;
  - Finance, Legal and approvers keep the case page;
  - an administrator is refused the exchange;
  - undecided oversight is refused and says undecided;
  - the last contractor Lead cannot be removed;
  - a request's contact details are refused to a reader without the contact SULIT right;
  - `supplier-reach.test.ts` still passes, unweakened.

**P2. data-modeler, then domain-engineer and api-engineer: document types and the register** [configuration files].
- The migration adds `ProjectDocumentType` and `ProjectExchangePolicy`, and the two-person editor.
- Write `revision.ts`, `state.ts`, `clock.ts`, `type-issue.ts` and the register reader.
- **Done when tested:**
  - Z → AA and AZ → BA;
  - the clock runs only while the submission waits on RSAJ;
  - the target snapshot survives a type edit;
  - an unset basis reads calendar and shows ASSUMED;
  - working days skip the organisation's holidays;
  - a type with an unset target or higher approval cannot be issued;
  - overdue is judged on the organisation's today.

**P3. data-modeler, then api-engineer, then frontend-engineer: submit, review, answer, files** (ADR 0039 D1 to D7, D10, D11).
- The migration adds the submission tables with their write-once and append-only triggers, the two attachment owners and the three
  purposes, with the one-owner and purpose CHECKs replaced whole.
- Write `authority.ts` and `entitlement.ts`.
- The portal gets the submit route and the file route. Staff get the Project-stage exchange tab, built from `PageHeader`, `Tabs`,
  `DataList` and `Card` only.
- The demo-wipe plan learns the new owners.
- **Done when:**
  - two concurrent answers result in one;
  - a non-S.O. Reviewer's answer is refused and kept as a recommendation;
  - a Principal representative without contractor communication is refused the final answer;
  - a contractor cannot read an internal comment or file;
  - another contractor gets a 404;
  - a contractor upload over the per-contract bound is refused, and refused while the bound is unset;
  - a SULIT-class send to a contractor is refused while the switch is unset;
  - every download writes a `DocumentAccessEvent` with the supplier actor;
  - a multi-file send never holds the contract lock during `storeUpload`.

**P4. data-modeler, then api-engineer, then frontend-engineer: notices** (ADR 0039 D13).
- The migration adds `SupplierNotice` with its readAt-only trigger and kind CHECK. The `StaffNotice` CHECK changes in the same
  migration as `kinds.ts`.
- Add `/supplier/inbox`, turn the bell on, and add an entry in `src/lib/portal/nav.ts`.
- **Done when:**
  - each event writes exactly its ruled recipients (one test per AC-28 line);
  - overdue is written once per due day, on the register read;
  - no notice carries a SULIT figure or another contractor's name (a scan over the title and body builders).

**P5. data-modeler, then api-engineer, then frontend-engineer: the kick-off meeting** (ADR 0039 D12).
- The migration adds the meeting tables, the minutes purpose, and the act-status row that opens at EXECUTED.
- **Done when:**
  - scheduling before EXECUTED is refused;
  - a second live kick-off is refused;
  - the briefing is written only when missing;
  - `briefingMissing` is unchanged.

**P6. domain-engineer, then api-engineer: the six kinds as system types** (ADR 0039 D8, D9).
- The migration adds the typed detail tables and `WorkProgramme.projectSubmissionRevisionId`. No data migration.
- Each kind's old send path closes only once its system type is issued.
- The pinned `WorkProgramme` is written in the same act. The direct scrutinise and decide acts refuse a pinned row.
- Rewire the overview counts, the payments claim list and the claim-day reader to read both sources.
- **Done when:**
  - `projects.db.test.ts` and `handlers.test.ts` are rewritten to the register, citing AC-30;
  - old `ActAttribution` rows still resolve;
  - a delay notice is accepted on a contract with no contractor Lead;
  - an approved programme revision and its `WorkProgramme` row agree;
  - an FR-EOT-001 time-limit check reads the register's server-stamped day.

**P7. test-engineer, then code-reviewer and security-auditor, then a fix round.**
- **The demo slice**, on a fresh database through `demo:load` only:
  1. signing, then the kick-off;
  2. a contractor submits a drawing;
  3. the reviewer answers "Revise and resubmit";
  4. Revision B is approved;
  5. every notice is seen.
- **Access walk:**
  - another contractor never sees the contract;
  - staff outside the team never see the exchange;
  - SULIT files stay protected;
  - internal comments never reach the portal.

The exit for every wave in design note 0004 §5 applies: text snapshots, the ui-guidelines-reviewer, the review, a fix round and the log.

## 6. Questions for the product owner (each is designed to the default shown, and logged)

1. **New contracts and contractual notices** (ADR 0038 D5). A contract issued after go-live has no contractor member until staff set
   a Lead. *Default:* any active account of the awardee may send the six system types, member or not, and reads only what it sent.
2. **Higher approval needs both checks** (ADR 0039 D5). *Default:* the final answer under PRINCIPAL_SO_REP needs the principal capacity
   **and** the contractor communication scope.
3. **Oversight is read-only** (ADR 0038 D3). *Default:* yes.
4. **Day basis and SULIT switches** (`reviewDayBasis`, `sulitToContractor`, beyond §6.3). *Default:* both columns are added. Unset reads
   as calendar days (ASSUMED) and refused (SULIT) respectively.
5. **Typed detail tables instead of `detail Json?`** (ADR 0039 D8). *Default:* typed tables, because money is `Decimal`.
6. **The work programme record is written at send, not only on approval** (ADR 0039 D9). *Default:* at send, as the direct act records
   it today, with the decision written by the answer.
7. **No notice for meetings or team requests** (ADR 0039 D13). *Default:* none, since AC-28 lists none.
8. **Accounts opened after go-live are not members until added** (ADR 0038 D4). *Default:* yes.
9. **A statutory declaration received on paper** (ADR 0039 D10). AC-26 lets staff record a paper revision on the contractor's behalf
   and names no exception. *Default:* the declaration is excluded, because its step-up is the contractor's own signature and no staff
   path for it exists today. The alternative is `acts.recordOnBehalf` with the paper reference, recorded on behalf and shown as not
   signed (ADR 0034 D12).

## 7. R-1: what the founder must obtain from CPD before P1

Ask CPD for these in writing. Record each answer in the decisions log, with who gave it and the date.
1. **The sign-off itself.** Written sign-off of P-1 to P-7 as [NET-NEW], with the signer's name, the date and the version of the
   Award and Contract Requirements document signed (AC-7; scope register row 26).
2. **Review days.** Are review targets counted in calendar days or working days (AC-27)? If working days, which holiday calendar?
   *Default:* calendar, shown as ASSUMED.
3. **SULIT to contractors.** May a contractor receive a SULIT-class document through the exchange (AC-29)? *Default:* no.
4. **The first document types.** For each: its name (English and Malay), its document class, its review target (or "no target"), its
   higher approver (none, the Principal S.O.'s Representative, or the S.O. office) and its answer set (AC-26, AC-27, AC-30). The same
   is needed for the six existing kinds as system types. *Default:* none issued, and the old path stays open for the six.
5. **Who approves member requests.** Who on the RSAJ side approves a contractor Lead's request to add a person (AC-25)? *Default:*
   holders of `supplierAccounts.manage`.
6. **The per-contract upload bound** (AC-29). *Default:* unset, so contractor uploads are refused.
7. **Notice retention under NFR-RET** (R-7, AC-28). *Default:* kept, with no disposal.
8. **Who is granted oversight**, if anyone (ADR 0038 D3). *Default:* undecided, so it is refused.

Items 2 to 8 are configuration the organisation enters through Configuration's two-person path once P1 to P2 exist. That path needs a
second account that can issue configuration. CPD's answers decide the values; nothing is seeded outside `demo:load`.

## 8. Risks

- **Narrowing contractor reach without the backfill.** P1's parity test is the guard.
- **A gate that leaks past the exchange** locks out Finance, Legal or the approvers. `exchangeReach` is called only by exchange
  stores, and a scan pins the list.
- **Replacing the attachment CHECKs whole** can drop an existing owner. The migration test lists every owner before and after.
- **Concurrent answers.** The guarded update is backed by the write-once trigger.
- **Lock order.** It is pinned by a scan, as for the award locks.
- **CAD formats** in `src/lib/documents/media.ts` must be checked before drawings types are offered.
- **Configuration files** are shared with any concurrent builder. P2 runs only when nobody holds `src/app/configuration/**`.
- **The claim day drives the `InterimValuation` CLAIM trigger.** P6 tests both sources.
