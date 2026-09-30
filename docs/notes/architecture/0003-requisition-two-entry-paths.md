# 0003 — A requisition enters by one of two paths into one state machine

**Status:** accepted 2026-09-30 by the product owner (`docs/notes/decisions-log.md`, "· 6.1 ·" entries; plan
`docs/notes/plans/6.1-requisition.md`, OD-1, OD-10, OD-11)

## Context

The RSAJ specification contradicts itself.

- §7.4 and INT-01 make the ERP the master of requisition registration, the budget check and the DAL recommender chain. The ERP mints PROC and NM, and it delivers the requisition already approved.
- FR-REQ-001–009 ask the portal to capture, endorse, budget-check and route the requisition itself.
- The product is resold to customers with other finance systems, or none. AGENTS.md makes it a standalone system of record behind a façade.

## Decision

A `Requisition` has an `origin`. Both origins share one `RequisitionStatus` machine (§7.3.1).

- **PORTAL.** Raised, endorsed, checked and routed here. The portal issues its own `reference` from `NumberingSeries` key `requisition`, atomically: a row lock plus a unique backstop. ERP numbers are recorded against the requisition when the finance system returns them.
- **EXTERNAL.** Received through `RequisitionIntake` (`src/lib/integration/requisition-intake.ts`), with an INT-01-shaped payload. It arrives Approved. Its figures are stored as typed. Its approval trail is stored as received, flagged `checkedAgainstMatrix = false`, and **shown as "not checked against the approval matrix"**. The engine never re-routes it.

Both paths are always offered. **There is no per-organisation path setting yet.** One can be added when a customer needs to turn a path off.

The only adapter is `manualIntake`, where an officer types the payload. Every received field carries its source (`erpRefSource = MANUAL`, `MANUAL_ERP_ENTRY`), and the screen says so. Nothing contacts an outside system.

PROC and NM are consumed and never minted. Their shape is `CodeFormat` data, and each is unique per organisation. `RequisitionPolicy.erpReferenceRequired` decides whether Registered needs them, and null blocks registration. PROC is shown first once recorded.

## Consequences

- A customer with no ERP uses the PORTAL path only. RSAJ can run both during the transition.
- An ERP adapter later replaces `manualIntake` behind the same interface.
- FR-REQ-002 holds:
  - `manualIntake` requires PROC.
  - Registered requires PROC and NM whenever `erpReferenceRequired` is true.
  - Every downstream record links to a requisition row, so it resolves to exactly one PROC.
  - A PROC search returns the requisition and everything linked to it.
  - The row id is the database key because a draft has no PROC yet.
- Ruled out: generating PROC-shaped numbers in the portal.
