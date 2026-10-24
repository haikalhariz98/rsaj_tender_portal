import { exerciseHit, projectHit, requisitionHit, type ExerciseRow, type ProjectRow, type RequisitionRow } from "./hits";
import type { CaseGroup } from "./types";

/**
 * FR-REQ-002: one requisition's whole case from its loaded rows (ADR 0044 D4, ST-4). Pure. The store reads under the guards; this
 * drops a hidden exercise again, so the rule holds whoever loads.
 *
 * A hidden exercise is neither shown nor counted. A project the reader may see whose exercise is hidden (AC-18, contract stages only)
 * goes in `projects` at the top level, and an award with no contract under a hidden exercise is not shown at all.
 */
export interface LoadedCase {
  requisition: RequisitionRow;
  exercises: (ExerciseRow & { awards: ProjectRow[] })[];
  /// Awards of the requisition's exercises that are hidden from the reader and have a contract.
  contractOnly: ProjectRow[];
}

export function assembleCaseGroup(loaded: LoadedCase, hidden: readonly string[]): CaseGroup {
  const gone = new Set(hidden);
  return {
    requisition: requisitionHit(loaded.requisition, true),
    exercises: loaded.exercises.filter((e) => !gone.has(e.id)).map((e) => ({ hit: exerciseHit(e, false), projects: e.awards.map((a) => projectHit(a, false)) })),
    projects: loaded.contractOnly.filter((a) => a.contract).map((a) => projectHit(a, false)),
  };
}
