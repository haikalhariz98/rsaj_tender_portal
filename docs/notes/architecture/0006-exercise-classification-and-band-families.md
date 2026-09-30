# 0006 — Exercises are classified in Phase 1, and the method band is derived, not stored

**Status:** accepted — product-owner rulings 2026-09-30 (decisions log, "· 6.3 ·"); plan `docs/notes/plans/6.3-method-selection.md`

## Context

FR-MTD-001 requires three value-band families that are held separately: requisition approval, procurement method and contract terms. The matrix issue already holds the regime floors (`quotationFloor`, `tenderFloor`) and the D3 switch (`boundaryValue`, `boundaryInclusive`). 6.1 makes the requisition rules (`domain=requisition`) the requisition family, and scopes the switch to rules that opt in (`followsBoundarySwitch`). No terms band exists anywhere.

§13.3 keeps sourcing outside the system in Phase 1, but it expects the officer to "classify the exercise". §7.3.2 defines an exercise's Draft as "created against an approved requisition", and says it leaves Draft once method, basis and contract type are set. There is no exercise entity yet.

## Decision

1. **A minimal `SourcingExercise` exists from 6.3.**
   - Its status is DRAFT, DOCUMENTS_IN_PREPARATION or CANCELLED. 6.5 adds the remaining §7.3.2 states and the sourcing-window fields.
   - One requisition may have several exercises.
   - Creating one requires an APPROVED requisition with `sourcingPermitted`.
   - The exercise holds the controlled method, contract type and basis. It also holds a snapshot of the band determination: rule keys, regime, terms band, and the operator applied.
2. **The method family is derived.** It is the regime from the matrix floors, plus the `appointment`-domain rules keyed by `SourcingMethod.authorityMethodKey`. No table repeats those edges.
3. **The requisition family is the requisition rules.** `AuthorityMatrix.requisitionBoundary` is display-only, and no decision reads it.
4. **The terms family is a new `TermsBand` table, a child of the matrix issue.**
   - It is frozen when the issue is issued, so a case can cite the issue it was banded under.
   - It states which terms set applies, never retention or DLP figures.
5. **`boundaryInclusive` stays the one D3 switch.**
   - A `tenderFloor` that differs from `boundaryValue` is refused on save by a pure check in `src/lib` (`matrixPolicyFaults`), and so is a STATED boundary ruling with no source.
   - `bandConsistencyFaults` reports three problems on an issue as it stands:
     - a `tenderFloor` that differs from `boundaryValue` (legacy rows only);
     - an appointment or terms edge at the boundary that has not opted in;
     - a boundary edge whose opt-in disagrees with the regime.
   - Every exercise records the operator (GT/GTE), and whether the boundary was ruled (`boundaryProvenance = STATED`).
   - The `tenderFloor` edge in `regimeFor` always follows the switch. 6.1's per-rule opt-in in `inBand` must be passed explicitly there, never by a default.
6. **An exercise cannot outgrow its approved requisition.** Live sibling exercises together may not exceed the approved value. A split that crosses a regime warns.

## Consequences

- Each edge lives in exactly one place. The one place drift is still possible, the boundary value itself, is checked and surfaced.
- 6.5 extends `SourcingExercise` rather than adopting a separate selection record. URLs under `/sourcing/[id]` stay stable.
- A method-scoped preview needs a proposed method. Where a regime has no single default, the preview says the approver depends on the method instead of choosing one.
- Ruled out:
  - a uniform `ValueBand` table that copies the matrix and rule edges;
  - classification columns on `Requisition`;
  - a second boundary switch.
