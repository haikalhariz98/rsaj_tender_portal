# Phase 1 acceptance record

**Dated:** 2026-10-01. **Code state:** `7c12ffc` on `build-all-modules`. `npx vitest run` at that commit: 92 files, 1451 tests, all passed. Typecheck and lint were not re-run for this record.
**Supersedes:** §9 of `docs/notes/plans/phase1-closeout.md` (kept there as written at `0f99974`).
**Sources:** that plan's rulings table; `docs/notes/decisions-log.md` (cited as date · tag · phrase); `git log 861dd06..HEAD`; `docs/notes/plans/6.9-core-routing.md`; spec §13.3 and the requirement tables of §6.1, §6.3, §6.9, §6.10, §6.11, §6.12.
**Status:** for the product owner's decision. Nothing below is accepted until the "Acceptance" heading is filled.

Citations read "DL <date> · <tag> · <phrase>" (decisions log) and a commit hash. All DL entries cited here are dated 2026-10-01 unless shown. Priorities (M, S) are the spec's.

## 1. What Phase 1 delivers (spec §13.3)

Phase 1 is "the spine": the configurable approval engine (6.9, with the audit trail), committee management (6.10), requisition intake and routing (6.1), method selection and contract-type classification (6.3), and award with the securities and insurance registers (6.11, parts of 6.12). The spec's test of done is that an officer can raise a requisition, get it routed and approved correctly by value, classify the exercise, record a committee decision, and issue a compliant award instrument. Sourcing itself stays outside the system. Two limits apply to that sentence as built. A dossier-method award (including an emergency direct purchase) routes but cannot be awarded in the system until the document store lands (section 3). Everything that needs a signed-in user (named approvers, personal queues, notification, line-management delegation rules, maker-checker, hiding of restricted records) is deferred to sign-in by standing decision (`AGENTS.md`).

## 2. Checklist

Status words: **Met** · **Partly met** (what is missing) · **Deferred** (to where) · **Re-designated** (to which module).

### 6.9 Approval engine (FR-APR)

| Module | Req | Pri | Status | Citation |
| --- | --- | --- | --- | --- |
| 6.9 | FR-APR-001 | M | Met. Routing reads issued, dated configuration. The only fixed threshold found (14-day "aged") is removed | DL 6.9 · "FR-APR-001 MET"; R5 `4bf8fa5` |
| 6.9 | FR-APR-002 | M | Partly met. Contract-type dimension carried to 6.13 (Phase 4). No Phase 1 row in Appendix B.3 to B.5 varies by contract type. Example 10 asserts 16a/16c | DL 6.9 · "FR-APR-002 PARTLY"; `ec838ed` |
| 6.9 | FR-APR-003 | M | Met at type level. Joint partner office not modelled. Act badges show label and DAL code | DL 6.9 · "FR-APR-003 MET (type level)"; DL close-out · CO-9; `8dacca8` |
| 6.9 | FR-APR-004 | M | Met (built by R3). Core routing table versioned with each issue, shipped empty, with provenance. Per-rule generation flag, shipped unset. A rule may strengthen or add steps, never drop or weaken. Unset flag warns "chain as entered, not checked". Examples 1, 2, 5 run on generated chains. The R3 build has no separate acceptance entry in the log | DL 6.9 · "FR-APR-004 NOT MET, must-fix (R3)"; DL 6.9 · "R3 core-routing design approved" and "Departure 1/2"; `0a34b14`..`5aee530` (`0a34b14`, `452cf55`, `4bdeef9`, `cf6e8af`, `b365304`, `4db985e`, `5aee530`) |
| 6.9 | FR-APR-005 | M | Met | DL 6.9 · "FR-APR-005 MET"; 6.1 BD-11 (2026-09-30); 6.11 BD-3; 6.3 BD-3 |
| 6.9 | FR-APR-006 | M | Met | DL 6.9 · "FR-APR-006 MET"; 6.11 BD-3 (2026-09-30) |
| 6.9 | FR-APR-007 | M | Met, on the condition of a test of the decided-step record. The record is built in one place in `src/lib` and tested. Audit stays unattributed until sign-in | DL 6.9 · "FR-APR-007 MET on condition"; `ec838ed` |
| 6.9 | FR-APR-008 | M | Met. Submission is refused where the requester is the only holder of a route step (requisition, name route, award). Escalating past the requester's own steps not adopted (question to RSAJ, section 7) | DL 6.9 · "FR-APR-008 PARTLY, must-fix (R1)"; `cb0f9d0`, `26a547c` |
| 6.9 | FR-APR-009 | M | Met. Conflict declared on a pending step escalates it one level up, with the declaration on the trail. Allowed on mandatory person steps (ASSUMED). Never on committee steps | DL close-out · CO-6; `0d12b5b` |
| 6.9 | FR-APR-010 | M | Partly met. Pending-step escalation with a reason, and an office worklist at `/approvals`. Missing: personal queues and notification (deferred to sign-in). Vacancy on a mandatory step is refused, not escalated, until RSAJ rules. Delivery re-designated (section 3) | DL close-out · CO-7; DL close-out · CO-8 "re-designated"; `0d12b5b` |
| 6.9 | FR-APR-011 | M | Partly met. Missing: grantor must be the jobholder's superior and delegate a line subordinate; task-limited delegation cannot discharge an approval. No reporting lines in the data and no sign-in | `AGENTS.md` "Delegation line-management rules deferred"; 6.1 BD-11 (2026-09-30) |
| 6.9 | FR-APR-012 | M | Partly met. Built: upward reversion at routing; pending steps move by escalation (NO_AVAILABLE_HOLDER); a delegation by an unavailable grantor is refused without the holder's recommendation (recorded as text, "not attached"). Missing: automatic move of pending steps on marking absent (sign-in). Once the document store lands the recommendation must be attached (section 9) | DL 6.9 · "FR-APR-012 partly met"; `5fcb83e`; DL doc store · OD-6 |
| 6.9 | FR-APR-013 | M | Met as mechanism. The override rule set ships empty. Its content is a go-live condition (OQ-06) | DL 6.9 · "FR-APR-013 MET as mechanism" |
| 6.9 | FR-APR-014 | S | Deferred (backlog). No matter in the RSAJ corpus needs shareholder approval | DL 6.9 · "FR-APR-014 (S) deferred" |
| 6.9 | FR-APR-015 | M | Partly met. Built: rows immutable in the application, written in the change's transaction; export with a SHA-256 digest, the export itself audited. Missing: database-level edit refusal (sign-in and demo tooling). The screen says the digest proves the file, not the database. Known: `AuditEntry` cascades on Organisation delete (revisit with tenancy) | DL 6.9 · "FR-APR-015 partly met"; `28d9977` |
| 6.9 | FR-APR-016 | M | Met as mechanism. Destination per matter type, snapshotted at route open, shown as "If rejected: ...". Unset: the officer chooses, recorded as OFFICER_CHOICE. Configured destinations ship empty (go-live condition, B4). A committee's not-carried outcome governs committee steps | DL close-out · CO-3, CO-4, CO-5; `92a6b17`, `0828ac4`, `fd6b01b` |
| 6.9 | FR-APR-017 | S | Built in code (recall before the first decision, `status.ts`, tested). No log entry covers it | not established in the log (section 8) |
| 6.9 | FR-APR-018 | S | Deferred. Notification and personal queues with sign-in, targets and ageing reports: reporting not in this build (6.17 removed by the founder, 2026-10-04; 613A-C3). Waiting days are shown without a judgement | DL 6.9 · "FR-APR-018 (S) deferred" |
| 6.9 | FR-APR-019 | M | Met. Band edges come from the route's pinned issue rule; "band not recorded" where none is pinned; every route header names its stored clause | DL 6.9 · "FR-APR-019 PARTLY, must-fix (R4)"; `10e68df` |
| 6.9 | FR-APR-020 | M | Partly met. Versioned, draft then issued; a requisition routes under the issue in force on the day it was raised. Missing: maker-checker, which needs sign-in (it attaches at issuing) | DL 6.9 · "FR-APR-020 PARTLY, must-fix (R2)"; `6f651f6`; `AGENTS.md` |

Verification pass (DL close-out · CO-9, C5, C6): the §6.9.3 worked examples are regression tests on a test-only fixture, never seeded (`be6252a`); one-sen boundary tests and the dashboard summed in sen (`30cf45c`); every status write asks the state machine (`fd6b01b`); no edits while a successor route is open (`29da263`). The spec's FR-APR rows and NFR-AUD/NFR-SEC are the 6.9 scope in §13.3. NFR rows are not itemised here (section 8).

### 6.10, 6.1, 6.3, 6.11, 6.12

| Module | Req | Pri | Status | Citation |
| --- | --- | --- | --- | --- |
| 6.10 | FR-CTE-001 to 006, 009, 010, 012 | M | Met. Accepted. Deferred inside these: signed-minutes attachment (document store), not-approved memo (delivery), maker-checker on a quorum change (sign-in), per-matter presence | DL 6.10 · "ACCEPTED at c2e55c8"; DL 6.10 · "Signed-minutes attachment deferred", "Not-approved memo deferred", "Controlled quorum change", "§9.1 approved as a deferral"; `c2e55c8` |
| 6.10 | FR-CTE-004 (follow-up) | M | Met. A pending tabled matter can be withdrawn from the agenda before the sitting opens, with a reason, audited | DL 6.11 · BD-31; `f5cca10` |
| 6.10 | FR-CTE-007, 008, 013 | M | Re-designated to Phase 2 (6.4 to 6.6). Phase 1 has no late tenders or evaluation record | DL 6.10 · "FR-CTE-007/008/013 deferred to Phase 2" |
| 6.10 | FR-CTE-011 | S | Deferred. Needs exercises (6.5) and a Person to OrgUnit link | DL 6.10 · "FR-CTE-011 (S) deferred" |
| 6.10 | FR-CTE-014 | M | Met. Closed by 6.11: committee and CEO blocks read from `decisionRecord()` and the appointment route, frozen into the covering memo | DL 6.11 · "FR-CTE-014 closes here"; `861dd06` |
| 6.1 | FR-REQ-001, 002, 004 to 009, 015 | M | Met. Accepted | DL 6.1 · "ACCEPTED at 4d1b426"; `4d1b426` |
| 6.1 | FR-REQ-003 | M | Partly met. Endorsements name a Person with a timestamp. Missing: "named user" (sign-in) | DL 6.1 · "FR-REQ-003 partly met" |
| 6.1 | FR-REQ-010 | M | Partly met. Completeness return built. Missing: project-works letter and anggaran harga pack (Project entity D5, document storage) | DL 6.1 · "FR-REQ-010 project-works letter ... deferred" |
| 6.1 | FR-REQ-011, 014 | S | Deferred. 011 to D5. 014 to 6.2 (scope tabling), with 6.2 planned and ruled | DL 6.1 · "FR-REQ-011 (S) and FR-REQ-014 (S) deferred"; DL 6.3 · "FR-REQ-014 scope tabling waits for 6.2" |
| 6.1 | FR-REQ-012 | M | Met. Committee gate after DAL approval and before the first exercise, per funding route. Minutes as text; attachment deferred. The placement is ASSUMED and shown on screen (CO-1). "Perlu / Tidak Perlu / Tidak lulus" is the committee's carried label plus its not-approved outcome (CO-2). Setting unset blocks opening an exercise | DL close-out · CO-1, CO-2, "Scope approved ... conditions C1-C6"; `79dcd8c`, `ff312bd` |
| 6.1 | FR-REQ-013 | M | Met. Built in 6.3 | DL 6.3 · "Method selection ACCEPTED at cd9eca1" |
| 6.1 | FR-REQ-016 | M | Met for the Letter of Acceptance and the Inden Kerja. Purchase order and contract signature must call the same `commitmentFault` when built | DL 6.11 · "FR-REQ-016 closes here"; `861dd06` |
| 6.3 | FR-MTD-001 to 006, 011 | M | Met. Accepted | DL 6.3 · "Method selection ACCEPTED at cd9eca1"; `cd9eca1` |
| 6.3 | FR-MTD-007 | M | Partly met. Restriction snapshot and participant list built. Missing: hiding and access logging (sign-in); screens say "restriction not enforced until sign-in" | DL 6.3 · "FR-MTD-007 (M) partly met" |
| 6.3 | FR-MTD-008 | M | Gate built (`invitationFault`). Enforcement re-designated to 6.5. Until then award submission refuses a name-approval method without an approved, non-withdrawn name route | DL close-out · CO-8 (two entries) |
| 6.3 | FR-MTD-009 | S | Partly met. Reason, dossier reference, evidence note built. Attachments missing (document store, section 3) | DL 6.3 · "FR-MTD-009 (S) partly met"; DL 6.11 · BD-4 (2026-09-30) |
| 6.3 | FR-MTD-010 | S | Deferred to 6.13 (needs Contract) | DL 6.3 · "FR-MTD-010 (S) deferred to 6.13" |
| 6.3 | FR-MTD-012 | M | Profile built. Enforcement re-designated to 6.4, 6.12, 6.13 | DL close-out · CO-8 |
| 6.3 | FR-MTD-013 | M | Basis built, chosen by the officer. Composition and form selection re-designated to 6.4 | DL close-out · CO-8 |
| 6.3 | FR-MTD-014 | M | Partly met. "Populates the SK001 basis" not built: FR-MTD-013 says basis is orthogonal to type. Contradiction sent to RSAJ | DL 6.3 · "Contract basis always chosen by the officer" |
| 6.11 | FR-AWD-001 to 008, 012, 013 | M | Met. Accepted. Caveat: dossier-method awards cannot be awarded (section 3). Printed instrument carries a fidelity caveat | DL 6.11 · "Award ACCEPTED at 861dd06"; `861dd06` |
| 6.11 | FR-AWD-009 | M | Partly met. Clock, warning and cancellation built. Blacklisting deferred to 6.15 (needs Vendor); recorded as "blacklisting recommended" | DL 6.11 · "FR-AWD-009 blacklisting deferred to 6.15" |
| 6.11 | FR-AWD-011 | M | Deferred to Phase 2 (no tenderers or tender documents in Phase 1) | DL 6.11 · "FR-AWD-011 (M) deferred to Phase 2" |
| 6.11 | FR-AWD-010 | S | Deferred to Phase 2 and D7 | same entry |
| 6.11 | FR-AWD-014 | S | Scope approved as "generic". Condition-precedent kinds exist in configuration. Delivery not established | DL 6.11 · "Scope approved: ... 014 (generic)" (section 8) |
| 6.12 | FR-CON-001, 002, 008 | M | Met in the minimal form built in 6.11: Contract shell, number, registers, readiness gate only | DL 6.11 · "Minimal Contract shell"; "FR-CON-003-007, 009-014 deferred" |
| 6.12 | FR-CON-003 to 007, 009, 011 to 014 | M | Deferred to Phase 4a. The Contract shell is what 4a extends | DL 6.11 · "FR-CON-003-007, 009-014 deferred to Phase 4a" |
| 6.12 | FR-CON-010 | S | Deferred to Phase 4a (same entry) | same entry |

## 3. CO-8: what Phase 1 does not do

Acceptance does not wait on document storage or on RSAJ's paper-evidence answer. A dossier-method award, including an emergency direct purchase, **routes but cannot be awarded in the system**. Submission and issue are refused while no evidence can be attached (BD-4), and the exercise's Award tab says so before "Start the award". There is no paper-attestation exit. The document store is a separate platform module with its own ADR (0011); it must land before RSAJ go-live and before Phase 2 acceptance.

Re-designated out of Phase 1, on the FR-CTE-007 precedent: FR-MTD-008 enforcement to 6.5; FR-MTD-012 enforcement to 6.4, 6.12, 6.13; FR-MTD-013 composition to 6.4; FR-APR-010 delivery to sign-in. FR-MTD-008 condition, built and tested in `award/appointment.ts` (`submitFaults`, `invitationFault`): award submission refuses a name-approval method without an approved, non-withdrawn name route.

Citation: DL close-out · CO-8 (both entries); DL close-out · "Sequencing"; DL doc store · "Scope approved with conditions".

## 4. Founder's local-review items for 6.10

| # | Item | Fixed by |
| --- | --- | --- |
| 1 | A sitting that has not started says so instead of reading as not quorate | `13c11da` |
| 2 | The sitting banner says how many matters the configuration stops, and which | `2e7022d` |
| 3 | Demo matter d1 is a manual matter, not a reference to an exercise that does not exist | `f8b5275` |
| 4 | Minuted demo sittings carry the audit trail the actions would have written | `2ed67ba` |

Follow-up `8161e84`: sitting History labels name what a reference points at; demo matters d2 to d6 are manual; a scheduled sitting's register says it is taken at the start. These four items have no decisions-log entry; the commit messages are the record.

## 5. Founder UI directions delivered in this phase

Direction recorded in DL founder · "Direction from the founder" and DL founder UI · "Proposal ... adopted"; specified in `21d152f`, logged in `0b4ce47`.

| Direction | Delivered by |
| --- | --- |
| Activity feed built from status changes; no votes, recusals, attendance or configuration | `9234b59` |
| Page subtitles cut at 90 characters behind an information button; long literals rewritten | `4d04dac` |
| Organisation details and logo: schema and checks; Details tab, upload and shell; invented demo details, removed by the wipe | `c54c824`; `5695326`; `16a342e` |
| One shared searchable Select (single and multi) replacing every native dropdown | `f5bc8d2`; roll-out `6dba182` (`src/components/ui/select.tsx` is now the only `<select>` in `src`) |
| Notched floating label on every field (open question resolved for consistency; the founder may reverse it) | `7c12ffc` |

Open from DL "Where the build stopped": 6.10 at 390px (card titles cut beside buttons, act chips break mid-word); timestamps through `formatDate` show the UTC day (moves to `formatOrgDay`); shared-UI polish items. Not re-verified here.

## 6. Go-live conditions for a customer (RSAJ)

Each ships empty or unset on purpose. Until set, the system refuses or warns and names the setting.

1. **Rejection destinations per matter type (B4).** Until set, officers choose and it is recorded as a choice, not policy. DL close-out · CO-5.
2. **Committee not-approved outcomes (B4)**, voting rule and quorum (B5) per committee, carried-decision label. Unset blocks recording or minuting. DL 6.10 · "B4: NOT_CARRIED requires", "Voting rule: unset blocks".
3. **Committee gate per funding route** (`committeeGateRequired`) and its gate rules. Unset blocks opening an exercise. DL close-out · CO-1, C2.
4. **Core routing rows and the per-rule generation flag.** Unset: chains read "as entered, not checked", and issuing refuses a flagged rule with no core row. Rows above the CEO are RSAJ's to record. DL 6.9 · OQ-2.
5. **Government-funding override rule set (OQ-06).** Each funder rule set carries its own core table, never copied. DL 6.9 · FR-APR-013, OQ-7.
6. **Organisation time zone.** Unset blocks starting a sitting, tabling and voting. DL 6.10 · "§9.5 sent back".
7. **Budget policy:** `approvalCommitsBudget` per funding route; splitting-control keys, window and justifying office (B7); endorsement tiers; `erpReferenceRequired`. DL 6.1 · BD-13, BD-23, "Splitting check unset".
8. **Award controls:** instrument per regime, templates, recipients, signatories, bond basis, liability bands, quotation contract key. DL 6.11 · "Instrument per regime", BD-6, BD-7.
9. **Document store** before go-live, then: allowed types and size, classes, **malware scanning** (a go-live condition for any customer; every version is NOT_SCANNED until a scanner is configured). DL doc store · OD-3, OD-4, OD-7, "Sequencing".
10. **Sign-in.** A go-live condition for any customer (ruled at Phase 1 acceptance, section 10; DL 2026-10-01 · Phase 1 · "Sign-in ruled a go-live condition"). Building it stays deferred by standing decision (`AGENTS.md`; `autonomous-build.md` "Never") and is the founder's to schedule. Until it lands: audit rows are unattributed, approvers are recorded on behalf and not signed, SULIT records are not restricted, delegation line rules and maker-checker are absent, and the vendor portal (6.15b) and electronic tender box (6.15c) cannot ship.

## 7. Questions to RSAJ, collected from the rulings

- **Committee gate (CO-1):** is the gate after DAL approval and before the first exercise?
- **"Tidak Perlu" (CO-2):** not carried and terminal, or carried and proceed? Is a waiver wanted?
- **Conflict on a mandatory step; vacancy (CO-6):** may a mandatory step escalate for vacancy?
- **Head of Division (OQ-1):** B.3 says "recommend", B.2 says "propose" beneath the CEO. Is recommend a strengthening?
- **Joint and sole (OQ-3, FR-APR-003):** the order P/JP < R/JR < MR/MJR is ASSUMED. Who is the joint partner office?
- **Requester-only steps (FR-APR-008):** may the system escalate past the requester's own steps?
- **Abandonment (6.3 BD-1):** how is an approved or sourcing requisition abandoned or returned?
- **Name route (6.3 BD-6):** may one C&P officer both propose and give the mandatory recommendation?
- **Exercises above approval (6.3):** B7 owner on exercises summing above the approved value.
- **Basis (FR-MTD-013 v 014):** which controls, since the spec contradicts itself?
- **Budget (6.1):** does "Approved Account" mean committed plus spent? Does each funding route commit budget (finance)?
- **Secretary (6.10):** does the Secretary vote or count toward quorum (Terms of Reference, B5)?
- **Contract year (FR-CON-002):** the year of issue or of signature (LoA in December, signed January)?
- **Liability bands (FR-AWD-013):** which band holds RM25,000.50?
- **Boundary (D3):** which side of a threshold an exact value falls. Shipped as a per-issue switch, ASSUMED until RSAJ cites a source.

## 8. Not established

For the product owner to rule or confirm:

- FR-APR-017 (S): built in code, not logged.
- FR-AWD-014 (S): scope says "generic"; delivery not logged.
- NFR-AUD and NFR-SEC: named in §13.3 for 6.9, not itemised in any ruling.
- INT-01 and INT-02: named in §13.3 for 6.1. The log records only hand-entered intake behind a single state machine (6.1 "Two entry paths").
- FR-APR-004: no log entry accepts the R3 build; the code review of it is not recorded.
- Typecheck and lint at `7c12ffc`: not re-run for this record.

## 9. Document store addendum

**Accepted with carries 2026-10-01 at `f60e04b`**, conditional on the founder's native-engine confirmation of the document_store and document_store_rulings migrations (carry D1). Decided by the product-owner delegate on the founder's behalf, for the founder's review. Checks at `f60e04b`: `npm test` 131 files, 2192 tests, all passed; `npm run typecheck` and `npm run lint` clean; no test skipped. Plan: `docs/notes/plans/platform-document-store.md` (OD-1–OD-9, BD-DS-1–46); ADR 0011.

**What this changes in Phase 1's record**

- **BD-4 lifted.** Section 1's first limit and section 3's "routes but cannot be awarded" no longer hold. A dossier-method award (emergency direct purchase included) can be sent and issued once at least one live DOSSIER_EVIDENCE attachment exists. Submission snapshots the pins (`Award.dossierEvidenceSnapshot`). Issue is refused with no snapshot, or where a snapshotted version was withdrawn since, naming cancel and open again (BD-DS-21). Section 1's second limit (sign-in) stands.
- Phase 1 carry 1 (recommender audit row stored the office code): closed by `f112872`.
- Test edits flagged per plan §3: `justification.test.ts` "evidence is never a pass" gained an explicit evidence count of 0 and kept its assertion. New tests cover: one live attachment clears it; detached or withdrawn does not; issue is refused with no snapshot or a withdrawn pin. `award/core.test.ts` dossier fixtures unchanged in value. No existing assertion was weakened.

| Req | Pri | Was | Now |
| --- | --- | --- | --- |
| FR-CTE-004 | M | Met; signed-minutes attachment deferred | Met. Signed minutes attach to a minuted sitting; reads Attached / Outstanding / "Attached once the sitting is minuted"; minuting never waits on them (BD-DS-24) |
| FR-REQ-012 | M | Met; minutes as text, attachment deferred | Met. The gate card reads the cited sitting's signed copy |
| FR-REQ-013 | M | Met | Met; the coordination scope document can be attached (display only) |
| FR-MTD-009 | S | Partly met; attachments missing | Met. dossierFault passes on one or more live attachments; judged awards keep their pins |
| FR-APR-012 | M | Partly met; recommendation as text | Partly met. A new downward re-delegation by an absent holder is refused without an attached recommendation (OD-6). Earlier text-only delegations stand, labelled, until an edit opens or extends the end, moves the start earlier, or changes the grantor, office or delegate, or widens what is delegated (BD-DS-40). Still missing: automatic move of pending steps on marking absent, and line-management rules (sign-in) |
| FR-AWD-003, 008 | M | Met | Met, stricter (OD-5). A returned item counts only with its scan attached, for every award not ACCEPTED at landing; accepted awards are not re-judged (BD-DS-28) |
| FR-REQ-010 | M | Partly met | Unchanged. The anggaran harga pack still waits on D5 |

**NFR rows (supersede the section 10 table where they differ)**

| Req | Status | Missing, and where it goes |
| --- | --- | --- |
| NFR-AUD-001 | Partly met | Every upload, attach, detach, new version, withdrawal, hold and reclassification audited before/after in its transaction; downloads and refusals logged. Missing: actor → sign-in |
| NFR-AUD-003 | Partly met | Per-version SHA-256, re-checked on every download and Verify; mismatch refused and logged. Missing: per-case export with document versions (FR-APR-015 extension) |
| NFR-AUD-004 | Not met | SULIT bytes are never served (OD-2); access logging per person → sign-in |
| NFR-AUD-005 | Partly met | Stored-at is server time; "received on" is the organisation's day, never future, and an unset time zone refuses it |
| NFR-SIG-002 | Partly met | Wet-signed scan bound to its record by pinned version and digest; substitution only as a new version with a reason. Missing: binding to a signed-in identity |
| NFR-RET-001 | Partly met | Class carries trigger, method and authority (shipped unset); retentionState and disposalFault built and tested, worked example included. Nothing is ever disposed of: no disposal run |
| NFR-RET-002 | Met | Legal hold placed and released with reason and named person, shown on the document and every panel; blocks disposalFault |
| NFR-SEC-001 | Not met | Sign-in. Screens state anyone reaching the portal can open a non-SULIT document |
| NFR-SEC-002 | Partly met | SecurityClass on the class, snapshotted on the document; every downgrade refused until maker-checker; a set classification never unset. Missing: automatic SULIT → 6.2, 6.6, 6.8; maker-checker → sign-in |
| NFR-SEC-003 | Not met | Re-designated to Phase 3 with sign-in and D6 (DL 6.6 OD-1); ADR 0011 and the plan's "6.6" read as Phase 3. The store is not sealed storage |
| NFR-SEC-007 | Partly met | Content-sniffed type allow-list and size cap from organisation policy, unset refuses; refusals logged. Missing: malware scanning (every version NOT_SCANNED), a go-live condition |
| NFR-SEC-008 | Go-live condition | Bytes stay in the deployment's Postgres; hosting evidence still needed |
| INT-13 | Partly met | BlobStore façade with the Postgres driver; filesystem, S3 and Azure later as drivers; Public Server coexistence is a migration deliverable |

**Section 6, item 9** now reads: Document store landed. Before go-live set allowed types and largest file, document classes with classification and retention, and a malware scanner; size the deployment ceiling and the concurrency caps on the target host.

**Disclosed:** before the no-hand-edit rule, a builder deleted its own test rows from DocumentAccessEvent in the dev database. Later, a hand-run of scratch scripts changed the demo organisation's short name through audited actions, restored by reload. Neither touched shipped data.

**Carries**

| # | Item | Destination | Blocks |
| --- | --- | --- | --- |
| D1 | Native-engine confirmation of `document_store` and `document_store_rulings`: migrate deploy, empty diff, the nine CHECKs in pg_constraint | Founder, local review | First Phase 2 migration (X-6 rebuilds the attachment-owner CHECK) |
| D2 | What happened to security audit C-6 and code-review items | Recorded in the decisions log (C-6 declined until sign-in; must-fix 1–3 and should-fix 4 fixed) | Closed |
| D3 | Text-snapshot and sibling check of the doc-store UI | Recorded in the decisions log | Closed |
| D4 | Wipe planner treats screen-made sittings and delegations as real records (hard refusal, no exit) | 6.2 step 0 | Phase 2 acceptance |
| D5 | Delegation and attachment tables scroll inside their card at 1024 | Phase 1 carry 3 | Phase 2 acceptance |
| D6 | "Recorded on their behalf" wording in upload-actions, document-drawer, requisitions, escalation and rejection labels; component hints into `labels.ts` | Wording pass, tested | Phase 2 acceptance |
| D7 | No test pins the recommender audit row to the office name | Approval-matrix test | Nothing |
| D8 | Access events with no version kept by the wipe and counted | Revisit with sign-in | Nothing |
| D9 | Concurrency defaults and memory multiples measured on the target host | Devops, before go-live | Go-live |

## 10. Acceptance

**Decision: ACCEPTED WITH CARRIES**, 2026-10-01, at `31c1923` on `build-all-modules`. Decided by the product-owner delegate on the founder's behalf, for the founder's review.

**Checks at `31c1923`** (supersede the header line and the last bullet of section 8): `npm test` 98 files, 1509 tests, all passed; `npm run typecheck` clean; `npm run lint` clean (including `check-ui.mjs`). No test is skipped. The assertions removed since `3e0409a` were rewritten stricter or per ruling. Migrations rebuild with an empty diff; demo wipe/load round trip is clean; 20 Phase 1 screens at 1280 and 390 load with no sideways scroll.

**Why accepted.** Every Must in sections 2 and 3 is met, partly met with a logged deferral, or re-designated by a logged ruling. FR-APR-004 is met by the R3 build (below). The test of done in section 1 holds, with its two stated limits: dossier-method awards cannot be awarded until the document store lands, and everything needing a signed-in user is deferred.

**Rulings on section 8**
- FR-APR-017 (S): partly met. Requisition recall before the first decision is built, tested and audited. Name and award routes withdraw only on change or cancellation (backlog). Who is the originator cannot be told until sign-in.
- FR-AWD-014 (S): met in generic form. Condition kinds are configuration; conditions record required-by and met-on dates; the no-extension-of-time flag is stored on the award and shown. Contract-record display is carried to 4a and the default exclusion to the EOT module.
- FR-APR-004: met. R3 was built per C1–C8 (`0a34b14`..`5aee530`); the code review's must-fix on it is fixed; BD-R3-1 to 13 approved.
- INT-01, INT-02: not built; a departure from §13.3, waiting on D5. Phase 1 runs on the spec's named fallback (§9.1: operator entry, PROC captured, never minted). Reconciliation reporting is carried.
- NFR-AUD and NFR-SEC, itemised (a departure from §13.3 "6.9 in full", on the FR-CTE-007 precedent):

| Req | Status | Missing, and where it goes |
| --- | --- | --- |
| NFR-AUD-001 | Partly met | Before/after written in the same transaction as every change, no edit path. Missing: actor, role held, source address, reads of classified records → sign-in; penetration test → before go-live |
| NFR-AUD-002 | Met | The route pins its issue and clause (FR-APR-019, 020) |
| NFR-AUD-003 | Partly met | Trail export with SHA-256 (FR-APR-015). Per-case export with document versions → document store |
| NFR-AUD-004 | Not met | SULIT access logging → sign-in (FR-MTD-007 says so on screen) |
| NFR-AUD-005 | Partly met | Server time on every write. Decision days are typed from paper, never future, kept beside the server's recorded time; an approval made in the system → sign-in |
| NFR-AUD-006 | Partly met | Future days refused; "decided before the route or gate opened" refused. Back-dating exceptions with an authorising officer → sign-in |
| NFR-SEC-001, 004, 005, 006 | Not met | Sign-in (access control, admin separation and maker-checker, MFA, re-authentication) |
| NFR-SEC-002 | Not met | Classification model → document store (shared enum), automatic SULIT → 6.2, 6.6, 6.8 |
| NFR-SEC-003 | Not applicable in Phase 1 | Sealed bids → Phase 3 electronic tender box with sign-in and D6 (re-designated by 6.6 OD-1, 2026-10-01; superseded the earlier "→ 6.6"). 6.6 builds a paper envelope register holding no bid content |
| NFR-SEC-007 | Not met | Type, size and malware scanning → document store (scanning a go-live condition, OD-4). Phase 1's only upload is the organisation logo |
| NFR-SEC-008 | Go-live condition | Hosting region documented and evidenced |

**Sign-in (section 6, item 10)** is ruled a go-live condition for any customer. Building it remains deferred by standing decision (`AGENTS.md`). Section 6 now reads as ten go-live conditions.

**Not ruled here:** the founder's open question on vote secrecy beyond the activity feed (DL founder UI, `be00020`). It does not block acceptance.

**Carried**

| # | Item | Destination | Blocks |
| --- | --- | --- | --- |
| 1 | Recommender audit row stores the office code (export file only; no screen shows it) | Fix before document-store acceptance | Document-store acceptance |
| 2 | `saveTimeZone` reads "before" outside a lock; `saveMatrix` duplicate-label and funding-route checks outside the lock; `saveRule` sibling checks outside the transaction | Configuration hardening, before sign-in brings concurrent users and before go-live | Go-live |
| 3 | Configuration › Committees truncates names and scrolls sideways at 390 (carried since 6.3); configuration tables at 390 generally (BD-34, BD-R3-8) | Design-system change: a stacked list for configuration tables | Phase 2 acceptance |
| 4 | "Routed on: Its value band" reads vaguely on the requisition route | Wording from lib labels, tested | Phase 2 acceptance |
| 5 | Dashboard money stat spills 5px at 1280 | Shared `Stat` fix | Nothing |
| 6 | Time-zone Select ships about 430 options (40 KB) | Load the list on demand or narrow it | Nothing |
| 7 | INT-01/02 reconciliation report for the operator-entry path | Integration module after D5 | Go-live |
| 8 | FR-APR-017 recall on name and award routes | Backlog (S) | Nothing |
| 9 | FR-AWD-014 contract-record display; EOT default exclusion | 4a; EOT module | Nothing in Phase 1 |
| 10 | Section 5's open items (6.10 at 390; `formatDate` on instants) | A grep at `31c1923` found no instant rendered with `formatDate`; re-check with item 3 | Phase 2 acceptance |
| 11 | Everything in sections 2, 3 and 6 already deferred or re-designated, as cited | As cited | As cited |

**Section 9 (document store addendum)** is filled when the document store is accepted, not now.

**Next:** the document store per `docs/notes/plans/platform-document-store.md`. ADR 0011 and the plan's status are marked accepted with the rulings first. Then 6.2.
