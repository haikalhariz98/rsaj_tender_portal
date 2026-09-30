/**
 * No commitment against an unapproved requisition (FR-REQ-016).
 *
 * Guarded here; enforced by 6.11 when award instruments exist. The refusal names the
 * step still outstanding, so the officer knows whose decision is awaited.
 */

import type { ApprovalStatus, RequisitionStatus, StepDecision } from "./types";

export type CommitmentFault =
  | { code: "NOT_APPROVED"; outstanding: string | null }
  | { code: "NO_APPROVAL_ROUTE" };

export function commitmentFault(
  req: { status: RequisitionStatus },
  instance: { status: ApprovalStatus; steps: { sequence: number; roleLabel: string; decision: StepDecision }[] } | null,
): CommitmentFault | null {
  const approved = ["APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED"].includes(req.status);
  if (approved && instance?.status === "APPROVED") return null;
  if (!instance) return { code: "NO_APPROVAL_ROUTE" };
  const first = [...instance.steps].sort((a, b) => a.sequence - b.sequence).find((s) => s.decision === "PENDING");
  return { code: "NOT_APPROVED", outstanding: first?.roleLabel ?? null };
}
