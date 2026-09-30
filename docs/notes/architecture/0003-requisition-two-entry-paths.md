# 0003 — A requisition enters by one of two paths into one state machine

**Status:** proposed (plan `docs/notes/plans/6.1-requisition.md`, OD-1)

## Context

The RSAJ specification contradicts itself.

- §7.4 and INT-01 make the ERP the master of requisition registration, the budget check and the DAL recommender chain. The ERP mints PROC and NM, and it delivers the requisition already approved.
- FR-REQ-001–009 ask the portal to capture, endorse, budget-check and route the requisition itself.
- The product is resold to customers with other finance systems, or none. AGENTS.md makes it a standalone system of record that integrates behind a façade.

## Decision

A `Requisition` has an `origin`. Both origins share one `RequisitionStatus` machine (§7.3.1).

- **PORTAL.** The requisition is raised, endorsed, checked and routed here. The portal issues its own `reference` from `NumberingSeries` key `requisition`, atomically. ERP numbers are recorded against it when the finance system returns them.
- **EXTERNAL.** The requisition is received through `RequisitionIntake` (`src/lib/integration/requisition-intake.ts`), whose payload has the INT-01 shape. It arrives Approved. Its approval trail and budget snapshot are stored as received, and the engine never re-routes it.

The only adapter today is `manualIntake`: an officer types the payload in. Every field that was received carries its source (`erpRefSource = MANUAL`, `BudgetCheckSource.MANUAL_ERP_ENTRY`), and the screen says the figures were entered by hand. Nothing contacts an outside system.

ERP identifiers (PROC, NM) are consumed and never minted. Their shape is `CodeFormat` data, and each is unique per organisation.

## Consequences

- A second customer with no ERP uses the PORTAL path only. RSAJ can run either path, or both during the transition.
- An ERP adapter later replaces `manualIntake` behind the same interface. Nothing above the boundary changes.
- FR-REQ-002 still holds. `manualIntake` requires PROC, and Registered requires PROC and NM whenever `RequisitionPolicy.erpReferenceRequired` is true. Every downstream record links to a requisition row, so it resolves to exactly one PROC, and a PROC search returns the requisition and everything linked to it. The row id is the database key because a draft has no PROC yet.
- Ruled out: generating PROC-shaped numbers in the portal.
