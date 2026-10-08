# 0019 — The supplier register is staff-recorded identity with derived standing, and a supplier is never a Person

**Status:** Accepted (product owner's go, 2026-10-01: `docs/notes/plans/phase3-6-rulings.md` §6.15, OD-1 B and conditions (1)–(6);
written at 6.15a step 0, 2026-10-02). Plan: `docs/notes/plans/6.15-supplier-register.md`. Companion: ADR 0020 (identity,
Proposed, not built).

## Context

Phase 3 (spec §13.5) is the vendor portal: suppliers registering themselves, lodging their documents, buying tender documents and
submitting bids. Every one of those acts needs to know which company is asking, and nothing can answer that without sign-in, which
the founder's rules forbid building (AGENTS.md "Do not stub auth"; `autonomous-build.md` "Never"). Yet most of what the portal is
for is not self-service: SK001 7.3.4(a) eligibility, document currency, the SK002 7.5.1(c) suspension check at sale and SK008 §7.9
blacklisting are staff obligations discharged on paper today, and Phase 2 left four hooks waiting for a register (the sale's
"not checked", the opening's paper findings, the award's "blacklisting recommended", `ExerciseParty.vendorId` and
`Award.vendorId` with no foreign key).

Three answers were weighed (plan §0.1): build sign-in now (A, outside the product owner's remit), a staff-side register now
and the portal after sign-in (B), or a portal with an "acting as" picker (C, which is stubbing auth and shows every vendor's data
to anyone, the opposite of FR-VND-013). The product owner ruled B.

## Decision

1. **6.15a is a staff register.** An officer records a supplier from its paper application, lodges and verifies its documents,
   and decides the application on an engine route (`supplier_registration`, OD-2 A: rows ship empty, routing value null so only
   an unbounded rule can match, no rule refuses naming the Approval matrix). Every person named is "recorded on behalf of, not
   signed". No `/supplier/*` page is replaced; the vendor workspace stays NotBuilt until 6.15b.
2. **A supplier's people are never `Person` rows.** `Person` is staff and committee identity. A supplier's contacts are
   `SupplierContact` rows, so a separate vendor identity store (NFR-SEC-005, INT-14) can attach a `SupplierAccount` to a contact
   later (ADR 0020) without reshaping anything. Contacts and document scans are readable by anyone at the portal until sign-in,
   and every screen showing them says "Not restricted until sign-in" (condition 2); contact fields are registered SULIT so History
   and the audit export withhold them. No bank or E-Payment field is captured before sign-in (OD-3 B): a1 records only that the
   paper form was received, its scan SULIT at upload and never downloadable.
3. **Standing is derived, never stored as a column.** `Supplier` has no standing field. Standing is computed on read from the
   append-only `StandingEvent` rows, the documents and the policy (OD-7 A, the ADR 0014 pattern): blacklisted, suspended,
   suspended on lapse (only where `autoSuspendOnLapse` is set), active. An unset lapse rule with an expired mandatory document
   reads "Active — lapse rule not set; a mandatory document has expired", never a silent active.
4. **Documents are configured, never columns per regulator.** Document types, registration bodies' value lists (grade, category,
   specialisation, field code, class, permit type), entity types, countries and standing reasons are the customer's
   configuration; the published CIDB/MOF lists are an RSAJ go-live seed and a test fixture only. A renewal takes effect only once
   verified; a document not in order is never effective.
5. **Links are explicit acts.** A party or an award is linked to a supplier only by an audited act (OD-9); nothing matches on a
   registration number, empty never matches, nothing is backfilled. The foreign keys added to `ExerciseParty.vendorId` and
   `Award.vendorId` are added by a migration that aborts if any value is already set (condition 5). (6.15a fix round:
   naming the register's supplier on a document sale is such an act, made in the sale's transaction, so a first sale can be made
   where the register is required; an award takes its awardee party's link when the party is written, and an award linked on
   its own is never silently relinked; one supplier is one party on an exercise.)
6. **Decisions freeze their rules.** An application's decision, a sale's check, an opening's eligibility finding and a blacklisting
   each snapshot the policy values and labels they were judged under, and are rendered from the snapshot afterwards.

## Consequences

- Every sourced control in §6.15 and every Phase 2 hook can be met without sign-in; the register is the data the portal will
  read in 6.15b.
- Counter work stays: officers type paper applications. §13.5's headline (self-service) waits for sign-in, logged as a departure
  (condition 6) with FR-VND-001's self-registration, 005, 006's acknowledgement, 011's vendor view, 012, 013, 014, FR-DOC-010's
  inspection log and FR-AWD-010 re-designated to 6.15b, and NFR-SEC-003, FR-VND-013's sealed bid, FR-BID-008's "cannot submit"
  and FR-DOC-009's electronic half to 6.15c.
- Contacts and scans are not restricted until sign-in; the chips say so, and that is on the founder's end-of-build list.
- Rules out: `Person` as a supplier's identity, a stored standing column, regulator-specific columns, matching parties to
  suppliers by number, and an "acting as" picker.

## Amendments

**Amendment 1 (2026-10-04, 6.13 Part B step 0 go with changes, BD-613-83, 91; 615-C2; written and built at Part B run 0).** A registration cancelled is recorded from **one source only: a registration body's cancellation** (FR-ADV-010 reads an external registration), as a fact with the body (a configured registration body, its label frozen), the body's reference and the day it takes effect, by one act on the supplier's Standing tab (`recordRegistrationCancelled`, the only writer, held by a single-writer scan); the body's notice is attached on the record (REGISTRATION_CANCELLATION_NOTICE). No route. **A record made in error is withdrawn** with a reason (`withdrawRegistrationCancelled`): audited before and after, the row kept and shown withdrawn, and read by the standing rule and the register's lists as never in effect. Not built, for want of a requirement: the organisation's own cancellation of a registration, a REGISTRATION_CANCEL standing request and its `supplier_registration_cancel` route (on the founder's end-of-build list). A cancellation that stood is lifted by a new registration (the application path), not a withdrawal. Part B never writes a cancellation: a termination asks for blacklisting through this module's request and route (FR-TRM-017, OD-B15, Supplier locked last), which the route decides.

**Amendment 2 (2026-10-04, product owner's rulings on the Run 0 fix round, BD-613-108 confirmed and BD-613-109 approved; written at Part B run 1a).** Amendment 1's line "a cancellation that stood is lifted by a new registration" is a mechanism with six parts, each confirmed as built and each held by a named test:

- **(a) "After" is strict.** A cancellation ends when the supplier's registration day is strictly after the day it took effect (`cancellationEnded`, the only rule). A new registration on that very day would not end it, so sending and approving a NEW application then are refused (CANCELLED_APPROVE_FROM), naming the first day it can be approved. Tests: way-back.test.ts "cancellationEnded: strictly after; the same day is not; no day known never ends it", "boundary: registered on the very day it took effect, the cancellation still stands", "on the day the cancellation took effect: refused, naming the first day it can be approved (EN and MS)", "sending it for decision asks the same".
- **(b) The kind is asked at open, at send and at approval.** While a cancellation stands, only a NEW application opens; a RENEWAL or UPGRADE is refused, naming the exit (CANCELLED_NEW_APPLICATION_ONLY, EN and MS). A renewal opened before the cancellation is not approved under it, and a NEW opened under a cancellation later withdrawn as recorded in error is refused (KIND_NOT_FOR_STATUS). Tests: way-back.test.ts "cancelled: a new application opens; a renewal or upgrade is refused, naming the exit (EN and MS)", both "both orders with a withdrawal" cases, and "the file judged at approval carries the kind, the status and the cancellation in effect on the locked rows".
- **(c) A blacklisting beside the cancellation stops the new registration's approval.** The NEW application opens, as for an applicant, but sending and approving it are refused (BLACKLISTED_NOT_APPROVED). Test: way-back.test.ts "(c) cancelled and blacklisted: a new application opens, but sending and approving it are refused for the blacklisting".
- **(d) An ended cancellation stays on the record.** It is marked ended (the CANCELLATION_ENDED note, and the same words on the Recorded card's chip), and it can still be withdrawn as recorded in error, after which it is read as never in effect. Tests: way-back.test.ts "the worked example: cancelled while registered from 15 Jan 2025; Active again once registered on 5 Oct, saying so" and "(d) an ended cancellation stays on the record, marked ended, and may still be withdrawn as recorded in error"; run1a-words.test.ts "an ended cancellation's chip is the CANCELLATION_ENDED note itself (one source)".
- **(e) One rule in code for the standing and the barred list.** The register's barred count and Standing list name cancelled suppliers through `cancelledSupplierIds`, which applies `cancellationEnded`, because a query cannot compare the event's day with the supplier's. Test: watched-lists.test.ts "reads live cancellations taken effect on registered suppliers, and keeps only those not ended".
- **(f) The registration day moves to the approval day.** Approving a NEW application sets `registeredOn` to the day approved, and the audit keeps the day it was, so a later suspension or cancellation cannot predate the new registration. Tests: way-back.test.ts "a first registration's approval sets the registration day whether or not the supplier was registered (M-1)", "(f) the approval moves registeredOn to the day approved and the audit keeps the day it was", and "cancelled again after registering again: the later cancellation stands, and a new one may be recorded only then".

**BD-613-109: one live cancellation per registration.** Each cancellation names the registration it cancels (`cancelsRegistrationOn`, the supplier's `registeredOn` when recorded; CHECK `StandingEvent_cancels_registration`). The partial unique index `StandingEvent_one_live_cancellation` is on (supplierId, cancelsRegistrationOn) for live REGISTRATION_CANCELLED rows. So an ended cancellation, which is kept and not withdrawn, never blocks the next genuine one. The literal index on supplierId alone, with the new registration's approval stamping the cancellation ended, was rejected: it adds a second writer to an append-only fact. A registered supplier with no registration day is refused (REGISTRATION_DAY_NOT_RECORDED). Tests: one-live-cancellation.test.ts "the column: the pre-check first, then the column, the backfill from the supplier's registration day, the CHECK", "the index: a duplicate pre-check first, then the partial unique index on the supplier and the registration", "the writer sets cancelsRegistrationOn from the supplier's registeredOn, read under the lock", "a registered supplier with no registration day recorded is refused, in words (EN and MS)".

**Beside it (BD-613-105(c), S-1).** A suspension and a cancellation are facts from different sources and may coexist in either order. `standing()` ranks BLACKLISTED over CANCELLED over SUSPENDED, and withdrawing one never touches another. Tests: standing-order.test.ts "the same two events read the same whichever was recorded first", "withdrawing the cancellation never touches the suspension (both orders)", "reinstated while cancelled: the suspension ends, the cancellation stands". At a sale, a suspension beneath a cancellation fails the suspension check as well as the registration check (run 1a, Should 1). Test: sale-link-permission.test.ts "Run 1a (Should 1, flagged 6.15a): cancelled with a suspension in effect beneath it: both checks fail, the suspension check is not left unmade".

**What a withdrawal lists (BD-613-111, C1).** Withdrawing a cancellation names the bid openings that judged the supplier cancelled while it stood, each keeping its frozen finding. A refused sale wrote nothing, so the words say none can be listed. The list starts on the day the cancellation took effect. It ends, exclusively, at whichever comes first: the next registration day after that, or the next live cancellation's start (`cancellationStoodUntil`). So withdrawing one cancellation never names openings that a later one caused. Tests: judged-window.test.ts "withdrawing A lists only the openings A caused, not B's" and "the act and the panel bound it the same way (source)"; withdrawal-words.test.ts "the words name each, in English and Malay, and say refused sales left no record".

No waiting period between a body's cancellation and a new registration is built. Whether one applies is a question to RSAJ; if it does, it becomes a setting, shipped unset.

**Amendment 3 (2026-10-09, Phase 4a of the sign-in programme; plan ruling O-3 said this line is amended only when 4a lands).** Three statements above are superseded by ADR 0034 as built. (a) "A supplier's people are never a way in": a contact **may now hold a `SupplierAccount`** (ADR 0034 D2), opened by an officer holding `supplierAccounts.manage` who also holds the right to read the contact's SULIT details, or at acceptance of an online application. A contact is still never a `Person`, and the account is the contact's, not the supplier's. (b) "Every supplier is recorded by an officer" now has one companion path: an applicant may send an **online application** (the public form), and an officer **accepts** it; acceptance keeps the applicant's own words beside the register's entry (the officer's corrections are listed against them), and the supplier on the register is still created by the officer's act, under the supplier's lock, in one transaction with its audit rows. (c) "Contacts and scans are not restricted until sign-in" is **superseded for contacts**: the contact's name, email and telephone sit behind the SULIT read, for the screen, History and the audit export alike, and the writes that change them (editing, retiring, opening an account, issuing a code, unlocking) need that read too. This amendment does not change the rule for document scans, which is the document store's. The "Not restricted until sign-in" chip is no longer shown for contacts.
