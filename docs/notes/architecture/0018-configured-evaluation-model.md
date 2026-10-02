# 0018 — Evaluation runs a configured model, pinned at publication and executed from its frozen snapshot

**Status:** Proposed with 6.8 (2026-10-02), under the 6.8 rulings E-1..E-13 and OD-1..OD-10
(`docs/notes/plans/phase2-rulings.md` §6.8; decisions log "· 6.8 ·" entries). Plan: `docs/notes/plans/6.8-evaluation.md`.
Builds on ADR 0012 (the sealed estimate), 0016 (the envelope register) and 0017 (the paper opening record).

## Context

Evaluation decides who is recommended for a contract, so it is where a wrong weighting, a wrong pass mark or a wrong
rounding costs money. The customer's own documents describe several ways to evaluate: a traditional tender scored on
technical and financial capacity and then on price; a two-stage tender whose first stage a committee decides; a quotation
shortlisted and judged on aspects; each with weights, pass marks, bands and rounding that vary by method and by revision of
the governing document. None of these figures is the product's to ship (AGENTS.md rule 1), and an exercise must be judged by
the rules it was advertised under, even if the customer revises them halfway through.

The paper process also loops. A committee may refuse to carry an appointment and send it back for clarification or
negotiation; a late tender admitted after the opening joins the evaluation; an exercise may be cancelled at any point. Each of
these happens after scores exist. And nobody signs in yet, so every act is recorded on a person's behalf, not signed, and
every price and score is SULIT on screens no sign-in protects.

## Decision

1. **The model is configuration, versioned, and frozen when issued.** An `EvaluationModel` (route TRADITIONAL or TWO_STAGE)
   holds ordered stages (CHECKLIST, SHORTLIST, SCORED, ASPECTS, FINANCIAL_TEST, COMMERCIAL, COMPOSITE, COMMITTEE_DECISION,
   RECOMMENDATION), each with its side (implementing department, contract and procurement, or a committee), criteria (entered
   marks, pass or fail, or banded from a computed input), factor options, band sets and the aspects it asks. It moves DRAFT →
   ISSUED → RETIRED. Issuing checks the draft and writes its whole content into `contentSnapshot`; an issued version is
   read-only, a change is the next version, and one draft per model is open at a time. Retiring stops it being offered; the
   exercises that pinned it keep it. A draft never issued may be discarded, with a reason.
2. **Nothing has a default.** Weights, pass marks, maxima, bands, shortlist limits, the capital base and the score's decimal
   places are columns. Which side of a pass mark or a band edge an exact value falls on is stated for each one; unset blocks
   issuing (or the stage), naming the setting. Each carries its provenance (STATED, OBSERVED, ASSUMED) and its source.
3. **Chosen before publication, pinned at publication (E-1, E-2).** The model is chosen on the Window card and held on the
   exercise; the publication pins it in the same transaction (`evaluationModelPinnedAt`, guarded so it lands once) and its
   route is judged against the basis's there, so the card and the act give the same reason. Nothing is pinned later: an
   exercise published before models existed is never evaluated in the portal, and every act that needs a model names the
   real exit, cancelling and replacing the exercise.
4. **Evaluation executes the snapshot, never the live model (FR-EVL-007).** Every rule in `src/lib/evaluation` reads the
   pinned snapshot; a source scan (`sealed.test.ts`) holds that only configuration code reads the model tables. The policy
   values an evaluation depends on (the score's decimal places and their provenance) are frozen on the evaluation when it
   starts (`policySnapshot`).
5. **Arithmetic is fixed point, rounded once.** Marks and percentages are bigint ten-thousandths, money is sen; no float
   touches a score or a price. Stage figures stay unrounded inside; the composite is formed from the unrounded stage figures;
   the figure shown is rounded once, half up (ASSUMED), to the frozen places, and the figure judged against a pass mark is the
   figure shown (E-5). The financial test reads the monthly balances as `Decimal(18,2)` (E-6); the commercial stage reads the
   company estimate only from the opening's frozen schedule (ADR 0012), never the estimate tables.
6. **An evaluation is versioned, never edited after issue.** Version 1 starts from 6.7's carried offers (`evaluationSet`), a
   quotation's bid above the exercise's own ceiling excluded with its reason. A version is OPEN, then ISSUED (the report
   frozen, its reference drawn from the configured series, the exercise Evaluated), and may become SUPERSEDED or CANCELLED. A
   new version opens only from a committee's NOT_CARRIED outcome whose LOOP key is one of the evaluation's stages (E-8) or a
   supplementary opening's finalising (E-7); unchanged bidders' records are carried and labelled. Cancelling the exercise
   through the window's cancellation closes the version in force (E-10).
7. **The stages gate each other on recorded rows.** A stage takes scores only from members appointed to its side (E-4),
   only for bids in the running at it, until it is submitted; a submitted stage's results are written and stand. The
   recommendation needs every stage complete, no meeting open and no negotiation still with approval; the report needs the
   recommendation, the series and the template, and every applied validity extension's consent from the recommended
   tenderer. A negotiation is held only once its route on the `negotiation` domain is approved (FR-EVL-016).
8. **The downstream gates read the evaluation (E-8, E-9).** The committee tables an appointment only with its evaluation
   bundle (issued report and Kertas Cadangan); the award is opened only on an Evaluated exercise, to the recommended party,
   at the recommended price and period unless a reason is recorded for the difference.
9. **SULIT stays off broadcast surfaces (E-3).** Scores, prices, the report and its annexes are chipped SULIT on the
   Evaluation tab and the prints, never on a list, the dashboard, search or an export; their audit keys are registered in
   `sulit-fields.ts`, and uploads to the evaluation's owners are SULIT and not downloadable until sign-in.

## Consequences

- An exercise is judged by the rules it was advertised under, however often the customer revises its models; the trail can
  show which version and which places were used.
- A customer cannot evaluate in the portal until it issues a model for the method in use (D1). That is a go-live task, not
  a default the product supplies.
- An exercise published before models existed cannot be evaluated here; its exit is cancel and replace (E-1). There is no
  back door that pins a model late.
- Every rule is a pure function of the snapshot and the recorded rows, so the routing, scoring and gates are tested without
  a database, against the governing document's own worked examples (TA 109's 85.01).
- Until sign-in, "appointed to the side" and "recorded on their behalf" are attestations, not proof; SULIT figures are
  readable by anyone who reaches the screen. Both are stated on screen.
- Not built here: a late pin (E-1), FR-EVL-020 (deferred to sign-in, OD-7), CPR from the supplier register (entered with
  its report until 6.16), exporting annexes D and F while SULIT uploads are undownloadable (E-11).
