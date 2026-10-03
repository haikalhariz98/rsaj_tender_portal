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
(logged departure); inc 2 review queue shows a Callout naming the vendor portal (sign-in) in words [amended 2026-10-04, BD-614-31: was "naming 6.15b"; no module numbers on screen].

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

# Rulings — plans 6.16, 6.17 and the DataList SULIT guard (product owner, 2026-10-01)

**Build order (amended):** DataList SULIT guard and the 6.2 OD-8 list close-out (now) → Phase 2 rest → 6.15a → 6.12 → 6.14 inc 1 →
6.13 Part A → 6.14 inc 2 → 6.13 Part B → Phase 6 (6.16 → 6.17 inc 1 → 6.17 inc 2; Phase 6 acceptance = 6.17 inc 2).
[2026-10-04, founder: 6.17 Reporting is removed from this build. Remaining order: 6.14 inc 2 → 6.13 Part B → 6.16 → the founder's held questions. The 6.17 rulings below are kept as the record and are not built; ADRs 0027/0028 are unclaimed. Re-homed at 6.14 inc 2 step 0, 613A-C3.]
**ADRs:** 0026 (6.16), 0027 reports as live read models, 0028 case extract (6.17); the full 6.13 Part B plan takes 0029 and up.

## DataList SULIT guard — lands now, one design-system commit
The gap is live: `/sourcing` and `/requisitions` show the department-estimate value (SULIT per 6.2 OD-8) in plain, exportable columns,
and the dashboard shows it too. A column flag `sulit: true` puts the SULIT chip ("not restricted until sign-in") in the header and
removes Export from that list (search, filters, sort stay). No audited client export before sign-in; files that must leave are built
on the server and recorded (6.17 §4; 6.17 is out of this build, so no such server-built export exists yet: a SULIT list has no export at all). Test keyed on a SULIT-field registry (requisition and exercise estimated values, company estimate,
opening prices, corrected prices, scores, cprPercent): a source scan over `src/app` fails if any reaches a DataList row unflagged; a
component test checks a flagged column means no Export button. Dashboard value chipped in the same commit.

## 6.16 Contractor performance — approve with conditions
OD-1 A (6.14 certificate kind); OD-2 A narrowly: the stored 4-place total is judged and shown as stored on 6.16 and the 6.8 CPR input
only; `formFaults` adds TOTAL_NOT_EXACT (refuses forms whose totals are not exact at 4 places); OD-3 A; OD-4 overridden to a switch
`PerformancePolicy.ladReportBasis` (RATE_OF_RECORD | FORM_FORMULA) null, both figures always shown, null refuses the assessor's
signature only where the totals differ to the sen; form percentage is `PerformanceForm.ladDailyPct` (null; 0.025% fixture only); tests
pin 8,081.31 (formula, rounded once at total) and 8,081.40 (rate of record 269.38 × 30); step 0 confirms the workbook S36/R38 cells have
no ROUND; correct the plan's rule-1 table row. OD-5 A ASSUMED (days from LAD lines on issued certificates; waived shown apart). OD-6 A.
OD-7 switch with NOT_SCORED_WITH_REASON only, null; EXTERNAL_REPORT not built; not-scored reads "Not assessed" in 6.8, never 0 or Gagal;
stage verdict NOT_ASSESSED. OD-8 switch null; classification snapshotted per report. OD-9 A. OD-10 A ("Verifier's office not checked:
rule not set" printed). OD-11 A.
Conditions: step 0 confirms the DataList guard and re-checks 6.13 B interfaces (its full plan ruled first); ADR 0026; test-only fixture
of the seven RSAJ forms where the sources hold them, all issue clean, IT form passes FR-CPR-004's three cases at 0.15/0.075; new
CertificateKind reaches every list/total in its own commit, test proves a filed report changes no payment/retention/LAD figure; 6.8,
6.13 B, 6.15 hooks each own flagged commit, new tests only; go-live: classification, forms, category rules, verifier offices set before
any contract reaches a stage (FR-FIN-014); standard gates.

## 6.17 Reporting — approve with conditions
[OUT OF SCOPE: removed from this build by the founder, 2026-10-04. Kept as the record; nothing below is built. The deferrals that named 6.17 read "reporting not in this build" (FR-APR-018 targets and ageing reports; NFR-AUD-003 / NFR-SEC-001 report parts; savings).]
OD-1 A (FR-APR-018 partial S); OD-2 A new ApprovalTarget per step; OD-3 A (savings off `/reports` until sign-in: count and links only);
OD-4 B (named votes on the committee's own report page and Board export only); OD-5 A; OD-6 A; OD-7 switch null; OD-8 A live queries;
OD-9 A (no budget year → ask); OD-10 as listed, question to the Head of C&P.
Conditions: NFR-SEC-001 logged partial Must; the sealed-figure scan over `src/lib/reports/**` lists `case-extract.ts` as its one
exception with the reason; performance and vendor tabs follow each report's stored classification ("SULIT: on the supplier's record");
a stage covered by a 6.14 routing target takes no CycleStageTarget (test); the extract screen says the digest is in the same database
with no outside anchor; ADRs 0027, 0028; spend built last or deferred with a log line; the R5 test stays; standard gates.

## Founder's end-of-build list (continuing)
25. Non-SULIT list exports remain unaudited browser downloads — audit all exports? 26. Dashboard estimated value chipped — remove it
instead? 27. 6.16 OD-4 LAD basis switch overrides the plan; unset blocks most reports with LAD days. 28. 6.16 OD-2 CPR at stored
precision (exception to E-5). 29. 6.16 OD-7 no external-report path. 30. FR-CPR-006 signatures wait for sign-in; verifier seniority
unchecked. 31. Contract closure depends on performance configuration. 32. 6.17 no automatic escalation. 33. Savings off /reports until
sign-in. 34. Named votes on the committee report and Board export (joins vote secrecy). 35. Case extract readable by anyone until sign-in.
36. Case-extract tamper evidence is a digest in the same database; SULIT bytes left out.

## Questions to RSAJ
6.16: the seven forms, SA-G guides and bands as seed; OD-4; OD-5; OD-7; OD-8; the "more than one year" threshold; verifier offices;
contract-type/classification → form mapping; operative language per category. 6.17: D14 service levels; stage targets; OD-7 forecast;
OD-10 dimensions; OQ-17 commitment figure; "missing statutory documents".
