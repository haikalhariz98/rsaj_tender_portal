/**
 * Where a contract stands (§7.3.3, up to Active).
 *
 * Number allocated (6.11, at issue) → in preparation → pending legal endorsement ⇄ returned for
 * amendment → legally endorsed → executed (the RSAJ signature) → stamped → active. The loop with the
 * legal office has no limit and no timeout (FR-CON-006): a returned contract goes back only by being
 * submitted again. A contract is cancelled only before it is executed, and only through its award
 * (6.11 BD-17: an executed contract is ended by termination, Phase 5). Active is written only by
 * 6.13's possession act (`act: "POSSESSION"`); nothing in 6.12 writes it.
 *
 * "Awaiting conditions precedent" and "Ready to sign" are phases derived from the readiness gate and
 * the company resolution, never stored (FR-CON-008).
 */

import type { ContractStatus } from "./types";

export type ContractTransitionFault = "TERMINAL" | "NOT_ALLOWED" | "EXECUTED_NOT_CANCELLED" | "ACTIVE_ONLY_BY_POSSESSION";

export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  NUMBER_ALLOCATED: ["IN_PREPARATION", "CANCELLED"],
  IN_PREPARATION: ["PENDING_LEGAL_ENDORSEMENT", "CANCELLED"],
  PENDING_LEGAL_ENDORSEMENT: ["LEGALLY_ENDORSED", "RETURNED_FOR_AMENDMENT", "CANCELLED"],
  // Only by resubmission: the one act that leaves a returned contract is submitting it again.
  RETURNED_FOR_AMENDMENT: ["PENDING_LEGAL_ENDORSEMENT", "CANCELLED"],
  LEGALLY_ENDORSED: ["EXECUTED", "CANCELLED"],
  EXECUTED: ["STAMPED"],
  STAMPED: ["ACTIVE"],
  ACTIVE: [],
  CANCELLED: [],
};

/// The states after the RSAJ signature: the Contract Document is executed and the contract is not cancelled here.
const EXECUTED_STATES: readonly ContractStatus[] = ["EXECUTED", "STAMPED", "ACTIVE"];
export const isExecuted = (s: ContractStatus) => EXECUTED_STATES.includes(s);

/// The states in which the contract is being formed: the assembly, reconciliation and checks may still change.
export const formationOpen = (s: ContractStatus) => s === "IN_PREPARATION" || s === "RETURNED_FOR_AMENDMENT";

/// Before execution and not cancelled: the signatures, the WC check and the baseline draft may be recorded.
export const beforeExecution = (s: ContractStatus) => s !== "CANCELLED" && s !== "NUMBER_ALLOCATED" && !isExecuted(s);

export function contractTransition(from: ContractStatus, to: ContractStatus, ctx: { act?: "POSSESSION" } = {}): ContractTransitionFault | null {
  if (from === "CANCELLED") return "TERMINAL";
  if (to === "CANCELLED" && isExecuted(from)) return "EXECUTED_NOT_CANCELLED";
  if (to === "ACTIVE" && ctx.act !== "POSSESSION") return "ACTIVE_ONLY_BY_POSSESSION";
  if (!CONTRACT_TRANSITIONS[from].includes(to)) return "NOT_ALLOWED";
  return null;
}

/// What a contract's award may still do to it: an award's cancellation cancels its contract only before execution.
export const contractCancellable = (s: ContractStatus) => contractTransition(s, "CANCELLED") == null;

/// A stored state, or one of the two derived ones.
export type ContractPhase = ContractStatus | "AWAITING_CONDITIONS" | "READY_TO_SIGN";

/**
 * The phase shown for a contract. Legally endorsed, it is awaiting the conditions precedent while the
 * readiness gate is not met, and ready to sign once it is met and the company resolution is on file
 * (FR-CON-007, 008). Every other state is shown as stored.
 */
export function phaseOf(status: ContractStatus, gate: { ready: boolean }, resolutionOnFile: boolean): ContractPhase {
  if (status !== "LEGALLY_ENDORSED") return status;
  if (!gate.ready) return "AWAITING_CONDITIONS";
  return resolutionOnFile ? "READY_TO_SIGN" : "LEGALLY_ENDORSED";
}

export const CONTRACT_PHASES: readonly ContractPhase[] = ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED", "AWAITING_CONDITIONS", "READY_TO_SIGN", "EXECUTED", "STAMPED", "ACTIVE", "CANCELLED"];
