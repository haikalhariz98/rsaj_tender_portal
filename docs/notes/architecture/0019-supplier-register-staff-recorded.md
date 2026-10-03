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
