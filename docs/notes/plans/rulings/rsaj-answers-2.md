# Founder's answers of 2026-10-27: BINDING build brief

Source: the founder's answers, from RSAJ's documents. They are recorded in docs/notes/rsaj-questions.md under "Answered (founder, 2026-10-27…)". RSAJ values go in the RSAJ pack data (`prisma/rsaj/**`) only, never in product code (AGENTS.md rule 1). The generic product keeps the switch or column, and the RSAJ pack sets it. Each pack row cites its document clause, as the existing rows do.

Two RSAJ documents are now on disk:
- SK004: `docs/requirements/14. SK004 PENYEDIAAN DOKUMEN KONTRAK.pdf`;
- the six appointment-letter samples: `docs/requirements/rsaj-templates/`.

Never copy them outside the repo.

## Route choices (Q16, settled): change the RSAJ pack in prisma/rsaj/starter-pack/approvals.ts

**B1. Termination: the DAL only.**
- Remove the SK008 option rows (`TERMINATION_SO_*`). SK008 §7.5.1 has no value bands; those bands were the DAL's Letter of Acceptance signing rule (3.1.4.4 item 5).
- The DAL rows `TERMINATION` and `TERMINATION_QUOTATION` stop being a choice: no `choiceOptionEn`, so no CHOICE_NOT_MADE.
- Check the termination module (FR-TRM-*): after the DAL approval, the S.O./P.D. signs the notice of intention and the termination notice (SK008 §7.6.2).
  - If the notices already name the S.O./P.D. as signatory, cite it.
  - If not, report it; do not build a new signing flow this round.

**B2. Extension of time: SK006 §7.6.1 (amended 12.01.2026), all three routes, no choice.**
- No financial impact: the Variation Orders Committee approves (`EOT_NOFIN_SK006`). Remove the DAL option rows `EOT_NOFIN_*`, including `EOT_NOFIN_Q`.
- With financial impact: the VOC gives a mandatory recommendation, then:
  - the CEO approves when the delay was caused by an authority's requirement;
  - the Tender Board approves for any other cause.
- The existing `EOT_FIN_AUTHORITY` / `EOT_FIN_NOT_AUTHORITY` rows match this, but are limited to TENDER_CONTRACTS. Re-cite them to SK006 §7.6.1, and decide from SK006's own scope whether they also cover quotation contracts. Say which and why.
- The S.O./P.D. signs the EOT certificate (§7.7.1). Check the EOT certificate's signatory and report it.

**B3. Extension of the contract period: SK006 §7.6.2 where it speaks, no choice.**
- No added value: the VOC approves (`PX_SK006_NO_VALUE`).
- More than RM50,000: the VOC recommends, then the Tender Board approves (`PX_SK006_ABOVE_50K`).
- RM0.01 to RM50,000 (the gap): route by the DAL rows (`PX_TENDER`, `PX_QUOTATION`), bounded to that extension-value band.
  - Their provenance must say this is the DAL standing in for SK006's gap: ASSUMED, or STATED with a note, following the pack's existing pattern for gap-fills. A gap stays honest (AGENTS.md rule 2).
  - Their labels name the band.
- Make sure the bands don't overlap and leave no other gap: exactly 0, 0.01 to 50,000 inclusive, then above 50,000. Use the matrix's boundary convention.

**Choice machinery.** After B1–B3, if no RSAJ rule carries `choiceOptionEn`, the generic choice machinery (D2: `choiceOptionEn`, `chosen`, CHOICE_NOT_MADE) stays in the product, since another customer may need it. The RSAJ pack simply has no choices left. Check the "make your route choices" Getting-started item or banner disappears when there are none.

## Other answers

- **Q4 Claims Committee:** loss-and-expense claims go to the Tender Board (KP002 §5.12.5). If the pack or the demo has any "Claims Committee", route it to the Tender Board and cite KP002.
- **Q6:** a Tender Board sitting whose chairman is absent and has appointed no CEO cannot proceed. Check that quorum or chair logic already refuses; if a chair rule is missing, report it rather than build.
- **Q11 Evaluation:**
  - Scores are rounded half up before banding: 79.5 is 80. Find where the band is chosen (`src/lib/evaluation/**`). If rounding is customer policy, make it a column and set it in the RSAJ pack; otherwise use the existing rounding helper. Test 79.5 → band at 80, and 79.4 → below.
  - Full marks for Phase 2 are 90%: set it in the RSAJ pack's evaluation model if the model has that field; otherwise report it.
- **Q12 Interim payment:** the default route is the CPD route, variant (i), 52 days (21 user department, 21 CPD, 10 Finance). Set the RSAJ pack's default to variant (i). If it is currently "the officer picks", the RSAJ default is (i) and skipping CPD is not offered unless RSAJ enables it.
- **Q22(c) Tender number:** the serial is unpadded and can pass 99 (RSAJ/TA/24/2025, RSAJ/TA/109/2024). Fix the RSAJ pack's tender number format: no NN padding, no cap. Add a test with serial 109.
- **Q22(d):** only the Schedule of Rates letter uses the quotation number as its contract number. If the pack applies the quotation number as the contract number for every quotation contract, limit it to Schedule of Rates. If the product cannot tell an SOR contract apart, report it. Whether other quotation contracts use the inden number stays open (Q22).
- **Q29 Consultancy:** its own contract type in the RSAJ pack, with the RSAJ/KP/P series (SK004 §7.2.1), if not already.
- **Q35:** Consultancy is paid on certified claims (SK011); set its payment route in the pack (it was unset under WV-14). Service stays on certified claims, monthly (KP003 §5.10.2): re-cite it.
- **Q34:** Supply on delivery order and invoice (KP004 §5.10.2): re-cite it, no change.
- **Q30:** quotation variations already carry "MR by VOC" above 20% (`Q_VO_20_TO_50`, `Q_VO_ABOVE_50`). Confirm and cite it; no change.
- **Q33 Online award return:** Contract & Procurement receives it and its questions (SK003 §7.9.3). Load a NotificationRule in the RSAJ pack naming the C&P office for the online return and award question events (PA048–PA051's events; see WV-8, where packs loaded no rule). Use the existing notification-rule pack pattern.
- **Q28 letters:** the officer picks the letter. Record the variant facts only: IT & QA leaves out the SPAN permit and insurance clauses; One Shot means a one-off quotation, not an SOR term contract; over RM50K adds retention and a defects period. Do NOT build letter templates this round; say what building them would need.
- **Q38:** 7 years retention. Record it as the RSAJ value in the pack if a retention column exists; otherwise record it in the backlog's retention row. Disposal is not built.

## Apply

1. After a `pg_dump` backup of `perolehan` (MSYS_NO_PATHCONV=1 in Git Bash), apply the RSAJ pack changes to the dev database `perolehan` through the pack loader (`npm run pack -- rsaj --apply`). Note the loader fills only empty values. Where a row must change or be removed (the B1/B2 rows and choices already loaded), use the pack's own update path if one exists. Otherwise use a small audited dev script, as the dev-fill does: audited as SYSTEM, one transaction.
2. Never drop or reset the database.
3. Report exactly what changed in `perolehan`.
