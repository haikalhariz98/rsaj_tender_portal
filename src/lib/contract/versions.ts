/**
 * The baseline's versions (ADR 0021, OD-2 A). The draft is worked on until a version is recorded; then it
 * is never edited again, and every later change is a version of its own:
 *
 * - CONFIRMED, before the first valuation: once the conditions FR-PAY-014 sets for a certificate before
 *   signature hold (the readiness gate: the instrument returned, the bond and the insurances verified),
 *   with nothing the baseline still needs;
 * - EXECUTED, at the RSAJ signature: the version in force with only the Contract Date added (or the draft,
 *   where none was confirmed);
 * - CORRECTION, anything else, with a reason; a certificate that pinned an earlier version keeps it.
 *
 * The Contract Date is never changed here: its correction is its own act (`contract-date.ts`), which then
 * writes a CORRECTION version carrying it.
 */

import { isExecuted } from "./status";
import type { ContractStatus, Finding } from "./types";

export type ConfirmFault = "NOT_IN_PREPARATION" | "ALREADY_VERSIONED" | "GATE_NOT_MET" | "BASELINE_INCOMPLETE" | "NO_DRAFT";

export function confirmFaults(i: { status: ContractStatus; hasDraft: boolean; versions: number; gateReady: boolean; baselineBlocks: number }): Finding<ConfirmFault>[] {
  const out: Finding<ConfirmFault>[] = [];
  if (i.status === "CANCELLED" || i.status === "NUMBER_ALLOCATED" || isExecuted(i.status)) out.push({ code: "NOT_IN_PREPARATION", level: "block" });
  if (!i.hasDraft) out.push({ code: "NO_DRAFT", level: "block" });
  if (i.versions > 0) out.push({ code: "ALREADY_VERSIONED", level: "block" });
  if (!i.gateReady) out.push({ code: "GATE_NOT_MET", level: "block" });
  if (i.baselineBlocks > 0) out.push({ code: "BASELINE_INCOMPLETE", level: "block", data: { count: i.baselineBlocks } });
  return out;
}

export type DraftFault = "CANCELLED" | "NOT_IN_PREPARATION" | "VERSIONED";

/// The draft takes keyed values only before any version exists and before execution.
export function draftFaults(i: { status: ContractStatus; versions: number }): Finding<DraftFault>[] {
  if (i.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  if (i.status === "NUMBER_ALLOCATED" || isExecuted(i.status)) return [{ code: "NOT_IN_PREPARATION", level: "block" }];
  return i.versions > 0 ? [{ code: "VERSIONED", level: "block" }] : [];
}

export type CorrectionFault = "CANCELLED" | "NO_VERSION" | "REASON_REQUIRED" | "NOTHING_CHANGED" | "BASELINE_INCOMPLETE";

/// A correction version: on a baseline that has one, with a reason, changing something, and leaving it complete.
export function correctionFaults(i: { status: ContractStatus; versions: number; reason: string; changed: number; baselineBlocks: number }): Finding<CorrectionFault>[] {
  if (i.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  const out: Finding<CorrectionFault>[] = [];
  if (i.versions === 0) out.push({ code: "NO_VERSION", level: "block" });
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (i.changed === 0) out.push({ code: "NOTHING_CHANGED", level: "block" });
  if (i.baselineBlocks > 0) out.push({ code: "BASELINE_INCOMPLETE", level: "block", data: { count: i.baselineBlocks } });
  return out;
}
