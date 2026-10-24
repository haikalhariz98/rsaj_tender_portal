# 0045 — The award is accepted online, and supply contracts send a delivery order and invoice

**Status:** Proposed, 2026-10-24. Written by the solution architect for wave V. It becomes accepted for building once the product
owner rules WV-1 to WV-16 in `docs/notes/plans/wave-v-plan.md` §6. The build plan is that file.

**What it replaces:**
- It takes the place of the "ADR 0040, the award return may be lodged online" that design note 0004 §7 reserved. Number 0040 went
  to the staff-screen language layer, so 0045 is the record.
- It is the "supply claims and the typed payment route" record that 0004 §7 left unnumbered.
- Nothing accepted is superseded.

**Relation to other records:**
- **ADR 0007 is unchanged.** `issueAward` stays the only place a Contract is created. The award is still accepted only by
  `acceptOnCompleteReturn`.
- **Extends ADR 0011** with one staging marker, one attachment owner (`awardOnlineReturnId`), two attachment purposes and one
  class setting.
- **Extends ADR 0042:**
  - a seventh kind, `SUPPLY_CLAIM`;
  - two file purposes on a version;
  - the words "Verified" for that kind's Taken up.

  D1 to D11 are otherwise unchanged. Its "no figures" rule (D4) holds for the claim itself.
- **Uses ADR 0034** for the actors, the supplier password step-up (`confirmSupplierPassword`), act slots and SULIT writes.
- **Uses ADR 0043.** The new settings are Getting-started items, and a pack never sets one over a set value.
- **Design note 0004 rulings:**
  - **kept:** AC-5, AC-6, AC-31, AC-33 and AC-34;
  - **released:** AC-35 and AC-48, by the founder's instruction of 2026-10-24 ("then wave V") and by PW-1, which replaced AC-7's
    build gate (WV-1).

## Context

- **The founder asked for two things** (2026-10-24):
  1. the contractor accepts the purchase order or indent online in the portal, with the finance system's number shown, in place
     of the paper acceptance page, and can raise a query (V-1);
  2. a supply contractor uploads a Delivery Order and an invoice against the contract and tracks it (V-3).

  Works and services stay on certified claims, and payment stays with finance.
- **The binding sources set limits on both** (AC-0 order of authority):
  - **FR-AWD-003 and FR-AWD-008 (M).** The signed letter, the declaration and the authorisation, or every field of the acceptance
    page, come back before the award counts as accepted. No SOP authorises electronic signature (spec, line 4654): until one
    does, the hybrid applies, and the wet signature is captured as a scan bound to the record. AC-31 reads V-1 that way: an
    online return, verified by an officer.
  - **FR-CON-004 (M).** An amendment needs two signatures, so there is no "accept with changes".
  - **Spec §7.4.**
    - The finance system mints PO and IN numbers. The portal consumes them (`manualCommitment`, INT-04/05).
    - The finance system owns payment, the ledger and payables. Scope register row 39 puts AP matching out of scope.
  - **§6.13.2.** Works are paid on a certified valuation, never on a PO, goods-received and invoice match.
  - **Scope register row 26.** A supply contract sends "the Delivery Order with the supporting invoice as that contract type's
    claim evidence — kept distinct from the certified-valuation route".
  - **AC-33.**
    - A supply claim is recorded and shown only: no matching and no approval.
    - Goods received is recorded in the finance system.
    - Payment status is entered by hand.
    - A typed payment route is nullable and shown as unset, and reconciles with BD-613-128.
- **What exists:**
  - The return is recorded by an officer from paper (`recordReturn`, `src/app/awards/actions.ts`).
  - Its scans are award attachments under the purposes `SIGNED_LETTER`, `DECLARATION`, `AUTHORISATION` and `ACCEPTANCE_PAGE`.
  - `acceptOnCompleteReturn` accepts the award the moment the record and the live scans are complete (OD-5, BD-12).
  - The contractor already sees its contract in the portal from ISSUED (`STANDING_AWARD`).
- **Why the Project workspace cannot carry the return, though it carries the supply claim:**
  - **It opens too late.** ADR 0042 D11 opens the workspace from EXECUTED (`PROJECT_WORKSPACE`), and
    `preflightProjectUpload` refuses before that. The return happens at ISSUED.
  - **Its class cannot hold the return.** The project class must not be SULIT (contractors download it), and the return carries
    the signatory's identity card number, a SULIT field (`AwardReturn.icNumber`).
  - **It does not meet the officer's check.** A workspace "Taken up" does not move an award to ACCEPTED, and it would bypass the
    SULIT write rule and the `AwardReturn.receivedBy` slot that `recordReturn` enforces.

  A supply claim is different. It arrives after execution, it is a contractor document that is received and marked, never
  approved, and it carries nothing SULIT. That is exactly what ADR 0042 D4's kinds already are.

## Decision

### D1. The online return is a pending record, verified into the existing return

- **One new table, `AwardOnlineReturn`.** The portal never writes `AwardReturn` and never attaches files to the award.
  - Why: `acceptOnCompleteReturn` would accept the award at once, with no officer's verification.
  - What the row holds:
    - the award and the submitting supplier account;
    - the server moment and the organisation's day it was lodged (`submittedOn`), and the moment the password was asked again
      (`stepUpAt`);
    - for a work indent, the acceptance page's typed fields: signatory name, IC number, occupation, address and capacity, the
      witness's name, and the three attestations "signed", "stamped" and "witnessed", each true;
    - one decision: verified (by whom, when) or refused (by whom, when, with a reason).
  - **Write rules, held by triggers:** insert-only, apart from the decision, which is set once. At most one undecided row per
    award (a partial unique index).
- **Its files are attachments of the row.** Each scan is a `DocumentAttachment` with the new owner `awardOnlineReturnId` and the
  scan's existing return purpose. The submit act pins it, as ADR 0042 D8 pins a version's files.
  - **Why an owner, and not a JSON list of staged versions:** a SULIT document with no owner has no subject that grants a read.
    `documentBytesAccess` would withhold it from every officer, and `sulitAttachRefused` would refuse the officer's attach of a
    file the contractor staged. With an owner, the officer reads it under the award's exercise scope, and every read is logged.
  - The owner's SULIT scope is the award's exercise (`owner-scope.ts`).
  - Only the submit act attaches to it. No staff attach or detach is offered, and once the row is decided its attachments are
    frozen.
  - The act refuses a staged file that:
    - was not staged for an award return;
    - was not staged by the same account;
    - is already attached;
    - is not in the return class.
- **Who may lodge it.** Only a portal account of the awardee whose contact may sign for the company (`contractorSigningFaultOf`:
  the organisation's `contractorPortalSigning` switch and the contact's `authorisedToSignForContractor`). The password is asked
  again on the submit route, as for the statutory declaration.
- **What is lodged** follows `RETURN_SCANS`:
  - a Letter of Acceptance: the signed letter, the signed declaration and the Surat Pewakilan Kuasa;
  - a work indent: the signed acceptance page, plus the page's fields.
  The scan of the wet signature, witness and stamp stays required. That is the hybrid (FR-AWD-008, spec line 4654).
- **Verification is one act by an officer.** It reuses `recordReturn`'s guards, moved into a lib core both acts call:
  - `staffForAct("TRANSACTION")`;
  - `sulitWriteRefusal` on `icNumber`;
  - the `AwardReturn.receivedBy` act slot;
  - the not-before-issue and not-after-today checks.

  Under the award's lock, the act:
  1. writes the `AwardReturn` fields from the online row;
  2. attaches each of the row's versions to the award under the same return purpose, through the same attach rules as a staff
     upload. The officer is entitled to it through the row;
  3. sets the row verified;
  4. calls `acceptOnCompleteReturn`.

  All four steps write their audit rows in the same transaction. If the return is not complete, nothing is written.
- **Refusing.** The officer gives a required reason. Nothing is attached to the award. The refused row keeps its files, as the
  record of what was sent. The contractor sees the reason and may lodge again, with new uploads.
- **The days.**
  - Every item's received day is `submittedOn`: the organisation's day on the server when the contractor lodged it (WV-3). It is
    never the day of verification, so the officer's queue never counts against the contractor's 14 days (FR-AWD-006).
  - `whereHeld` reads "Lodged online".
- **Paper and online do not mix on one award (WV-4):**
  - an online return is refused once any paper item is recorded or a live return scan is attached;
  - while an online return waits, `recordReturn` and a staff attach of a return purpose are refused, naming it;
  - a waiting online return does not count as returned for `instrumentReturned` (BD-17).
- **The class.** Staged return files take `DocumentStorePolicy.awardReturnClassId`, which must be a SULIT class (WV-5).
  - Unset, the online return is refused, naming the setting, and the paper path is unaffected.
  - The contractor never downloads a return file back. The portal shows each file's name and size.
- **No click-only acceptance, and no column for it (WV-2).** AC-31's unset switch is not built until CPD and Legal rule on
  electronic signature (R-5). An unread column is dead weight, and leaving it out has the same effect as leaving it unset.
- **There is no decline and no accept-with-changes** (FR-CON-004). The contractor accepts the instrument: the Letter of
  Acceptance or the indent, not the finance system's PO (AC-31).

### D2. The commitment number is shown, never required

- `Award.erpCommitmentNo` and its kind are shown in the portal when recorded: "Indent IN2026…" or "Purchase order …".
  - Absent, the portal says nothing about it.
  - It is never a precondition of the return (AC-31).
- The number stays the finance system's, typed by an officer behind `CommitmentGateway` (INT-04/05). No portal act writes it.

### D3. Queries are a small table while the award is issued

- **`AwardQuery`:** award, question, asking account, when asked; answer, answering person, when answered.
  - Insert-only. The answer is set once, by a trigger.
  - Asked only while the award is ISSUED, by any active portal account of the awardee.
  - Answered by an officer under `staffForAct("TRANSACTION")`, with an act slot.
- **A query pauses nothing.** The indent's validity, the acceptance return days and commencement do not move (AC-31).
- **After acceptance the contractor uses the Project workspace** once it opens, so no second channel is built.
- **The contractor sees answers on the portal.** No supplier notice table and no bell (ADR 0042 D6).

### D4. Notices go to the staff inbox, from notification rules

- Two closed `StaffNotice` kinds, `AWARD_RETURN_LODGED` and `AWARD_QUERY_RAISED`. `kinds.ts` and the CHECK change together.
- **Recipients:** the holders and acting holders of the offices named by the organisation's `NotificationRule` for the events
  `award.return.lodged` and `award.query.raised`, looked up for the requesting unit, as the clock notices are (AC-42).
  - With no rule, or a rule that is off, no office is told. Nothing is guessed (WV-8).
  - The case's primary action still shows "Verify the return" to anyone who opens it.
- **Nothing is emailed** (ADR 0044; email waits for Entra and Outlook).

### D5. How a contract type is paid is a typed, nullable column

- **`ContractType.paymentRoute PaymentRoute?`**, with the values `CERTIFIED_CLAIM` and `DELIVERY_ORDER_INVOICE`.
  - It is the typed twin of the free-text `interimPaymentRule`, which stays as its label (the run 1a convention).
  - Null means not set.
- **BD-613-128:**
  - The type's single `provenance` is not split.
  - No screen places the type's tag beside this value. The contract-type editor shows the route or "Not set".
- **Read live from the contract's type** (`award.exercise.contractTypeCode`) at each act, not pinned at formation (WV-9).
  - The route decides which kind the portal offers, not a sum, so ADR 0021's pinning is not needed.
  - The type of an awarded exercise is fixed (FR-MTD-011).
  - A route edit is a configuration change on the two-person path.
  - Claims already sent stay readable and payable whatever the route later says.

### D6. A supply claim is a seventh kind in the Project workspace

- **The kind `SUPPLY_CLAIM`** joins `ContractorSubmissionKind`. Its words are "Delivery order and invoice".
  - The legacy `ContractorSubmission` table refuses it with a CHECK. Its send path is already closed.
- **Which kinds are offered** (WV-10):
  - offered only where the contract's route is `DELIVERY_ORDER_INVOICE`;
  - on such a contract, `INTERIM_CLAIM` and `MATERIALS_ON_SITE` are not offered;
  - where the route is `CERTIFIED_CLAIM` or unset, the kinds stay as they are today.
- **Files** (WV-11). Every version of a supply claim carries at least one file of each of two new purposes on the
  version owner, `DELIVERY_ORDER` and `SUPPLY_INVOICE`. Both purposes are refused on any other version, and
  `PROJECT_DOCUMENT_FILE` is refused on a supply claim's version. The one-owner and purpose CHECKs are replaced whole.
- **No typed figures** (WV-12):
  - The document's title carries the invoice number. On this kind the title field's label is "Invoice number".
  - Amounts, dates and goods lines stay in the files (ADR 0042 D4).
- **Verification is the existing mark.**
  - A person with D2 authority marks the current version "Taken up", which reads "Verified" on this kind. A returned version
    needs remarks.
  - The kind takes no approvers (AC-33: no approval).
  - `takenUpWhere` points to Payments › Supply invoices.
  - Goods received stays in the finance system.

### D7. Finance's payment of a supply claim is recorded by hand, beside the certificate payment

- **`SupplyInvoicePayment`**, one per supply-claim document, write-once by a trigger. It holds:
  - the document;
  - the verified version;
  - the day paid;
  - Finance's batch number;
  - the amount paid, `Decimal(18,2)`, typed from Finance's remittance (WV-13);
  - the recorder (act slot `SupplyInvoicePayment.person`);
  - a note;
  - when it was recorded.
- **`FinancePayment` is not loosened.** Its `certificateId` stays required and unique.
- **The rules:**
  - recorded only once the claim is verified;
  - the day paid is not before the day it was verified and not after today;
  - the batch number is required;
  - the amount must be positive;
  - by `staffForAct("TRANSACTION")`, as `recordCertificatePayment`.
- **Nothing is matched.** The amount is never compared with the invoice, the contract sum or the budget. Like `FinancePayment`,
  it does not write the budget ledger.
- **The façade.** This table is the internal contract. The act is its manual adapter, as INT-07's is for certificates. A later
  finance-system feed writes the same row with a system actor. No column names an outside system's field.

### D8. Who sees what

- **The contractor sees:**
  - its own award's online return state;
  - its queries and their answers;
  - its supply claims, with Sent, Returned with remarks, Verified, and Paid with day, amount and batch.
- **Another contractor's contract or award** is the same 404 for every cause, as today (`supplierHoldsContract`).
- **Staff:**
  - read the online return and queries where they can read the case (`caseVisibility`);
  - read the IC number only through the existing SULIT read, logged.
- **The return files** are SULIT store versions. They are downloaded only by staff entitled to the award's SULIT records, and
  every download is logged.

## Consequences

- **Easier:**
  - The contractor accepts from the portal, the same day.
  - The officer checks scans that are already in the record, instead of typing a paper page.
  - The award's existing acceptance, clocks and readiness gate are untouched.
  - A supply contractor tracks each invoice to paid without a parallel document flow.
- **Harder:**
  - One award has two ways in, paper and online, kept apart by WV-4.
  - The `recordReturn` core moves into `src/lib/award/` so that both paths share it.
  - The attachment CHECK replacement must list every owner and purpose exactly.
  - Adding to `ContractorSubmissionKind` touches every exhaustive map of the kinds.
- **Ruled out:**
  - acceptance without scans (until R-5);
  - online decline;
  - accept with changes;
  - the portal minting or editing a PO or IN number;
  - invoice matching or approval;
  - an invoice route for works and services;
  - payment execution;
  - a supplier notice table;
  - email.
- **Go-live condition (extends PW-1).** The online return and supply invoices are vendor self-service, [NET-NEW] and unsourced
  (spec, line 864). Before either is used with the customer's real contractors, the decisions log records CPD's written
  acceptance of them, with the signer, the date and the document version. Until then they are demonstration-only. This is never
  inferred from a configuration value, such as the return class being set (WV-15).
