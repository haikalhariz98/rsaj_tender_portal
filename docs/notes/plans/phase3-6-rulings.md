# Rulings — plans 6.15, 6.12, 6.13, 6.14 (product owner, 2026-10-01)

All four approved with conditions; none sent back. One-line entries in `docs/notes/decisions-log.md`.

**Build order:** Phase 2 rest (6.2 → 6.4 inc 1–2 → 6.5 → 6.6 → 6.7 → 6.8) → 6.15a (a1 → a2) → 6.12 → 6.14 inc 1 → 6.13 Part A →
6.14 inc 2 → 6.13 Part B → Phase 6. 6.15b/c are gated outside the sequence. Phase 3 acceptance = 6.15a acceptance.

**ADR numbers:** 0013–0018 per X-3; 0019 supplier register; 0020 identity (Proposed, docs only); 0021 contract baseline; 0022
certificate record; 0023 routing-sheet projection; 0024 exact percentage bands; 0025 nominated/assignee lines before B1. Later ADRs
take the next number above the highest claimed, claimed in the same commit.

## 6.15 Supplier register — OD-1 B: staff-side register 6.15a now
Rulings: OD-1 B; OD-2 A with routing value null in 6.15a (unbounded rules only, rows empty, no rule refuses naming the matrix); OD-3 B
(no bank/E-Payment fields before sign-in; scan SULIT; FR-VND-005 partly met); OD-4 switch `expiryOnClosingDayCounts` unset →
NOT_ASSESSED; OD-5 `registerRequiredForSale` nullable; OD-6 A (unset consequence blocks finalising only where a FAIL exists); OD-7 A
derived on read, unset `autoSuspendOnLapse` with an expired mandatory document reads "Active — lapse rule not set; a mandatory
document has expired"; OD-8 A route `supplier_blacklist`; OD-9 explicit audited link only; OD-10 A grade ceiling shown, never
compared with the sealed estimate.
Conditions: (1) ADR 0020 docs only, Proposed — no User model, no SupplierAccount, no stub. (2) Supplier record and register carry
"Not restricted until sign-in" on contacts and scans; E-Payment form scan SULIT at upload. (3) Undelivered `/suppliers` promises stay
in a Callout naming their module (6.16, 6.15b). (4) One blacklist-period column `SupplierPolicy.blacklistFirstOffenceMonths`; 6.13 B
drops `blacklistFirstYears` and writes FR-TRM-017 as a StandingEvent through 6.15. (5) The FK migration aborts if any `vendorId` is
non-null; 6.5's demo keeps `ExerciseParty.vendorId` null; step 0 re-checks. (6) 6.15b/c re-designations logged as departures from §13.5.
Re-designated to 6.15b (sign-in): FR-VND-001 self-registration, 005, 006 acknowledgement, 011 vendor view, 012, 013 (attendance,
acknowledgement, own-bid status), 014, FR-DOC-010 inspection log, FR-AWD-010. To 6.15c: NFR-SEC-003, FR-VND-013 sealed bid,
FR-BID-008 "cannot submit", FR-DOC-009 electronic.

## 6.12 Contract formation and baseline (Phase 4a)
Baseline (FR-CON-014) built here; read by 6.13/6.14 only through `baselineFor`.
Rulings: OD-1 A Contract Date = organisation day of the recorded RSAJ signature act; audited correction to an earlier day only (reason,
never future, never before ready-to-sign; "corrected from …" shown). OD-2 A baseline confirmed before the first valuation, re-versioned
at execution adding only the Contract Date; anything else a CORRECTION version with reason; a pre-execution certificate shows so.
OD-3 A ASSUMED (contract sum = LoA sum, variance shown). OD-4 A. OD-5 A with source ENTERED and an officer-chosen provenance (no
default), labelled "entered at baseline, not from a tender Appendix". OD-6 A.
Conditions: ADR 0021; demo `demo_ai100`–`119`, `demo_mt15`–`19`, `demo_d50`–`59` grepped (X-10c); `Vendor` → `Supplier`,
`Award.vendorId` read only when present; WC check recorded not judged unless a configured WC basis exists ("Basis not set (D4)");
one lock order in `withLockedContract` with a source scan: Requisition → Exercise → Window/Party/Sale → Award → Contract →
Certificate → domain row → Supplier last; exhaustive `ContractStatus` maps; only 6.13's possession act writes ACTIVE.

## 6.14 Certificates (Phase 4e)
Rulings: OD-1 A (inc 1 straight after 6.12, inc 2 after 6.13 Part A acceptance); OD-2 A (pin template at first signature); OD-3 A
calendar days ASSUMED, shown, question to RSAJ; OD-4 A projection; OD-5 A data only, nothing ships; OD-6 A.
Conditions: ADRs 0022, 0023; computed-field overrides only in DRAFT, refused from IN_ROUTING, totals never overridable; snapshots
hold money as decimal strings; routing-target bands use the exact-ratio helper (test "20.00% → 2 weeks, 20.01% → 6 weeks"); the
§13.4 pre-award routing sheet (CPD/DFA/PRE T-QUO) in inc 1 as a RoutingSheetType over the award route, award tests unchanged
(logged departure); inc 2 review queue shows a Callout naming 6.15b.

## 6.13 Post-award lifecycle
Part A approved with conditions; Part B scope and questions approved in outline — the full Part B plan returns for a go at its step 0.
- OD-A1 A: FR-LAD-001–008 pulled into Part A; the non-completion decision has a recorded "delay excusable / entitlement pending"
  outcome letting a certificate proceed without an LAD line (reasons shown on the certificate); accrual window (FR-LAD-008) entered
  with the CNC, ASSUMED; Part B's EOT record replaces the CNC determination, never rewriting an issued certificate.
- Exact percentage bands — must-fix as the precondition to the first production caller (Part A step 1): retire float `pct` from the
  production query type; load `pctMin`/`pctMax` as Decimal strings (not `num()` in load.ts); `bandsMeet` exact; edge tests that fail on
  floats (7,000.00/100,000.00 at a 7% edge; 29,000.00/100,000.00 at 29%; 21,000.00/300,000.00 at 7%); worked examples 7–14 change
  input shape only, expectations unchanged and listed. (resolve.ts:121 `inPercentBand`; load.ts:10.)
- OD-A3 A: judge the exact money ratio; label "more than 10.00%" where the rounded figure equals the edge (differs from 6.8 E-5).
- OD-A2 switches `variationPctBasis`, `variationBase` null, unset refuses submission, demo ASSUMED THIS_VARIATION over ORIGINAL;
  OD-A4 A ASSUMED, question to RSAJ, remainder rule a switch; OD-A5 A; OD-A6 `paymentRouteFigure` null, unset refuses, demo ASSUMED
  RECOMMENDED; OD-A7 `soReResolve` switch, unset warns on the contract and each later S.O. block.
- B1 (OD-A8 A): ContractParty/PartyLine totals only as printed; "Payment annexes A1–A3 not available: totals only"; ADR 0025.
- B2 (OD-A9 A): mechanism, stated departure; per-contract entered recoupment schedule; APG VERIFIED; `advance_payment` rows empty
  refuse naming the matrix; screen "No documented advance payment procedure (B2); eligibility and percentage not checked".
- B3: retention from the baseline; `retentionApplies` false only from a configured band or a recorded decision with provenance; null
  applies, or null percent/cap, refuses the certificate naming the field; never 0.
- 75% unfixed materials: product ships null (rule 1 over FR-PAY-007's literal); RSAJ seed sets 75% STATED; null → NOT_SET, materials
  line refused, never 0%; B8 may set a per-contract figure.
- OD-B1 moved into A; OD-B2 switch `lossDaysComposition` null blocks the terminated account, both readings shown, demo ASSUMED A;
  OD-B3, OD-B4 as their interims (OQ-12, OQ-16).
- Conditions: ADRs 0024, 0025; Part A routes `demo_ai130`–`159` (6.15 keeps 120–126); sub-prefix `vap` → `vva`; wipes match exact
  three-letter sub-prefixes; FR-PAY-014 checked at issue on the allocated sequence under the contract lock (warning at open);
  `Vendor` → `Supplier`, FR-TRM-017 via 6.15's blacklisting path, Supplier locked last; partial Musts logged FR-SUP-002–004 (sign-in),
  FR-PAD-005 (no formula engine, OQ-13).

## Go-live conditions added
B1, B2, B3, B8 before any post-award contract runs in the system; RSAJ seed values (75%, routing targets, signature blocks and
distribution lists, the legal office, controlled-copy recipients).

## For the founder's end-of-build review (continuing from phase2-rulings.md item 12)
13. Sign-in (6.15 OD-1): whether and when to lift "Never build sign-in"; ADR 0020 drafted Proposed; 6.15b/c also wait on D6, SK002
§7.7, INT-10, external crypto review. 14. Phase 3 delivered as the staff register only (departure from §13.5). 15. Supplier contacts
and scans readable by anyone until sign-in; bank data not captured. 16. 75% unfixed materials only in RSAJ's seed. 17. B1 totals before
the annexes (ADR 0025). 18. B2 built as a mechanism though the spec says "cannot be built". 19. FR-LAD-001–008 pulled into Phase 4.
20. The engine's float percentage path retired; tests 7–14 change input shape. 21. Baseline timing and Contract Date (6.12 OD-1, OD-2).
22. §13.4 pre-award routing sheet delivered in Phase 4. 23. phase1-acceptance §6 item 10 corrected. 24. 6.13 Part B returns as a full plan.

## Questions to RSAJ
6.15: D6 and SK002 §7.7; registration approval authority and value basis (OQ-07); OD-4; OD-5; OD-6 consequence; blacklisting
authority and first-offence period; CIDB/MOF lists as seed. 6.12: OD-3 (B8); WC basis (D4); controlled-copy list; legal office.
6.13: OD-A2, OD-A6, OD-A5, OD-A4, OD-A7; B2 eligibility and percentage; OD-B2; D2 for Part B. 6.14: OD-3 calendar or working days.
