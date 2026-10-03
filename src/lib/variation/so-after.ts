/**
 * The S.O. after an adjustment of the contract sum is issued (6.13 Part A step 4: OD-A7 A, BD-613-21). Pure.
 */

import { soFaults, type SoResolution } from "@/lib/supervision/so";

import type { Finding } from "./types";

export type SoAfterAdjustment =
  | { state: "OFF" | "NOT_SET" | "SAME" }
  | { state: "MOVE"; resolution: Extract<SoResolution, { state: "RESOLVED" }> }
  | { state: "REFUSE"; faults: Finding[] };

/**
 * OD-A7 A (6.13 Part A step 4): when an adjustment of the contract sum is issued, the S.O. is resolved again at the
 * revised sum, where the switch says so. Off: nothing moves. Unset: nothing moves, and the warning stands (it is said
 * on the contract and on every later S.O. block). On: the same office stays as it is (no row); another office takes
 * effect from the adjustment's issue, a new assignment, the earlier kept (§7.2); no matrix or no single S.O. refuses
 * the issue, naming the matrix (the sum would move with nobody resolved to supervise it). Certificates keep the holder
 * they were signed under. Pure.
 */
export function soAfterAdjustment(switchValue: boolean | null, current: { roleCode: string } | null, resolution: SoResolution | null, matrixLabel: string | null): SoAfterAdjustment {
  if (switchValue == null) return { state: "NOT_SET" };
  if (!switchValue) return { state: "OFF" };
  if (!resolution) return { state: "REFUSE", faults: [{ code: "SO_UNRESOLVED", level: "block", data: { matrix: matrixLabel, why: "NO_MATRIX" } }] };
  if (resolution.state !== "RESOLVED") return { state: "REFUSE", faults: soFaults(resolution, matrixLabel) };
  if (current && current.roleCode === resolution.roleCode) return { state: "SAME" };
  return { state: "MOVE", resolution };
}
