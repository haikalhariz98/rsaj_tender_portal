# 0046 — The funding source: a new record, carried by derivation and fixed on the contract

**Status:** Proposed, 2026-10-27. Written by the solution architect for Phase 1, Sukuk core. The build plan is
`docs/notes/plans/sukuk-core-plan.md`. This record becomes accepted for building once the product owner rules FS-1 to FS-12
there. Its open questions Q1 to Q5 have defaults, so they do not block the build.

**Relation to other records:**
- **Nothing is superseded.**
- `FundingRoute` keeps its meaning and its routing role.
- **ADR 0007 is unchanged:** `issueAward` is not touched.
- **ADR 0037 is used:** case visibility.
- **ADR 0043 is used:** packs load only into empty lists, and a value is STATED only where a document states it.
- **ADR 0045 D7 is kept:** a supply claim still carries no figure.
- **FR-PAD-003 is kept:** the revised sum is read only from issued adjustments.

## Context

RSAJ's requirements (SF-01 to SF-05, RP-03, PR-04) ask:
- for a funding source such as SUKUK26T1 to be picked on the requisition and carried to payment;
- for its use to be limited to eligible project categories;
- for its proceeds to be reported as committed, certified, paid and unallocated;
- for a contract to be split across sources.

The founder directs that this adds to what is built, replaces nothing, and is a record separate from the funding route. The D365
link is on hold, so every figure comes from the portal's own records.

Three facts of the codebase shaped the decision:
1. Below the requisition, nothing carries funding. Every later stage reaches the requisition through `exercise.requisitionId`,
   which is non-null.
2. A requisition can end in several contracts (`PARTIALLY_FULFILLED`).
3. The requisition's estimate is SULIT, and the Dashboard reads no SULIT field (DB-2).

## Decision

1. **`FundingSource` is a new organisation table.** It holds:
   - the code the finance system knows, and a label;
   - an optional envelope as `Decimal(18,2)`, where null means not set and is never read as zero;
   - tranche, tenor and profit rate, as information only;
   - its eligible project categories;
   - provenance, and a retired date.

   It has no `kind`, because no rule may branch on a source being a sukuk.
2. **Eligibility is per source, on a new `ProjectCategory` list.** It has three states:
   - **set:** the requisition must name an eligible category;
   - **not set:** the requisition passes, with a warning;
   - **refused:** an ineligible category, or no category where the source names some.

   It is judged when a requisition leaves Draft, when its source is changed and when a split is recorded.
3. **The source is picked once, on the requisition, and derived until a contract fixes it.**
   - The tender, the award and the case before signing read the requisition's source.
   - A contract's funding is resolved in order: its own `FundingAllocation` rows (percentages summing to exactly 100); otherwise
     the requisition's source at 100%; otherwise not set.
   - Once a live contract exists under a requisition, the requisition's source and category can no longer change. So a recorded
     fact never moves when the requisition is edited, and nothing is copied at award.
4. **A split is fixed once money is certified on the contract.** That means an issued payable certificate or a supply payment.
   Each save replaces the split whole and is audited with its before, after and reason.
5. **The use-of-proceeds figures are pure functions** (`src/lib/funding/proceeds.ts`), defined so that no money counts twice:
   - **Committed** is the contract sum plus its issued adjustments. A terminated contract counts its certified figure; a cancelled
     one counts nothing.
   - **Certified** is the frozen paid figure of the issued payable certificates. A supply contract's certified figure is not
     held, and the source's figure says it is partial.
   - **Paid** is Finance's certificate payments plus supply payments.
   - **Unallocated** is the envelope minus committed. It is not set when there is no envelope, and it is never clamped.
   - **Not counted:** approved requisitions. They are a pre-encumbrance, and their estimate is SULIT. They are shown as a count.
   - **Rounding.** Each figure is split by basis points to the sen by largest remainder, with a fixed tie order, so the parts
     always sum to the whole.
   - **Unreadable figures.** A figure that cannot be read refuses by name.
6. **Reading.** The tab is gated by `mayReadBudget`, and restricted cases are excluded as on every Dashboard figure.
7. **Packs.** The RSAJ pack loads the four stated sources:
   - SUKUK26T1 with its RM100m envelope, 5 years and 4.5%;
   - INTERNAL, GRANT and NA, with no envelope.

   It loads **no eligibility**. The document's SUK-LAND and SUK-TANK are D365 test-environment groups, not a stated policy.

## Consequences

**What this makes easy:**
- The build is additive: one migration of new tables and two nullable requisition columns, and no backfill.
- A second customer's sources are a pack.
- D365 reconciliation later is a `FinanceVariance`-style comparison keyed by the source code.

**What this makes hard:**
- A contract cannot be re-split after money is certified. If RSAJ needs that (Q4), a forward-dated split applied by date
  supersedes decision 4.
- The certified figure for supply contracts stays partial until supply claims carry a figure.

**What this rules out:**
- Branching on a source's type.
- Copying the source at award.
- Counting requisition estimates in any Dashboard figure.
