# 0007 — A contract shell is created at award, and the registers attach to it

**Status:** accepted — product-owner rulings 2026-09-30 (decisions log, "· 6.11 ·", minimal Contract shell); plan `docs/notes/plans/6.11-award.md`

## Context

§13.9 requires the award and the securities register to ship together: the performance bond and the insurances are conditions precedent
to signing (FR-CON-008), and an award with no register produces a contract that cannot lawfully be signed. §7.1 puts the securities
and the insurance policies on the Contract, and FR-CON-002 numbers the contract "immediately" once the Letter of Acceptance is issued.
Contract formation itself (assembly, legal endorsement, signature, stamping, controlled copies, baseline — FR-CON-003–007, 009–014) is
Phase 4a. Phase 1 has no Contract entity.

## Decision

1. The issue transaction creates a minimal `Contract`: its number (from `ContractType.contractSeriesKey`, or the indent number on the
   quotation route where `AwardPolicy.quotationContractKey` says so), where the number came from, the day it was numbered, the award
   it came from (`awardId @unique`), the contract sum as awarded, and a status of NUMBER_ALLOCATED or CANCELLED.
2. `SecurityInstrument` and `InsurancePolicy` belong to the Contract, never to the Award. `CaseOwnershipEvent` (FR-CON-001) hangs off
   it too.
3. Cancelling an issued award cancels the shell. Its number stays allocated and is shown as a recorded gap; its registers stay, read-only.
4. The award keeps every pre-contract fact (awardee snapshot, bond decision, letter terms, return). 4a adds the remaining §7.3.3
   states and the baseline to the same row.

## Consequences

- 4a extends one table rather than migrating registers from Award to Contract.
- A contract number exists before signature; the readiness gate is readable on the award from the day of issue.
- Ruled out: registers on the Award with a `contractId` added later; a contract created at signature.
