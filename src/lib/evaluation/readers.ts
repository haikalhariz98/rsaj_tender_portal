/**
 * The Secretariat and Internal Audit as readers of an evaluation (product owner, 2026-10-08, decisions log line 1735; FR-EVL-014 names both). Which office plays each is customer
 * policy, so each is a nullable office setting on the evaluation policy with its provenance and no default. Pure: the holdings are read by `src/lib/auth/evaluation-readers-store.ts`.
 *
 * - A holder of the office ON THE DAY OF READING reads the evaluation scope, and the company estimate once it is disclosed (FR-EST-008's "until the bids have been opened" is
 *   over by then). An office held for a department counts for that department's exercises only, as in the estimate's custody (`officeHoldersOn`).
 * - Unset reads "not set" and grants nothing: never "nobody" and never "everybody".
 * - It does not open a restricted exercise: FR-MTD-007's named list prevails there, and the Secretariat names its people.
 * - It grants READING only: the write rule (`sulitWriteRefusal`) does not take it into account, and every evaluation act keeps its own checks (`scoreFaults` and the rest).
 * - It is not the estimate-audit office (`ScopePolicy.estimateAuditRoleCode`), which means custody of the estimate.
 */

import type { SulitGrantBasis } from "@/lib/auth/sulit-access";
import { officeHoldersOn, type RoleHolding } from "@/lib/scope/estimate";

export type EvaluationReaderBasis = Extract<SulitGrantBasis, "SECRETARIAT_OFFICE" | "INTERNAL_AUDIT_OFFICE">;

export interface EvaluationReaderOffices {
  secretariatRoleCode: string | null;
  internalAuditRoleCode: string | null;
}

/// The office, if any, by which this person reads the evaluation on this day for this unit. The Secretariat is told first where a person holds both.
export function evaluationOfficeHeld(offices: EvaluationReaderOffices, holders: readonly RoleHolding[], personId: string, day: string, unitPath: readonly string[]): EvaluationReaderBasis | null {
  if (offices.secretariatRoleCode && officeHoldersOn(holders, offices.secretariatRoleCode, day, unitPath).includes(personId)) return "SECRETARIAT_OFFICE";
  if (offices.internalAuditRoleCode && officeHoldersOn(holders, offices.internalAuditRoleCode, day, unitPath).includes(personId)) return "INTERNAL_AUDIT_OFFICE";
  return null;
}

/// The office codes the setting names, for the one read of who holds them.
export const evaluationReaderCodes = (offices: EvaluationReaderOffices): string[] => [offices.secretariatRoleCode, offices.internalAuditRoleCode].filter((c): c is string => !!c);

/// What the configuration screen says of each setting, and of the two together.
export const READER_OFFICE_LABEL = {
  secretariatRoleCode: "The Secretariat office for evaluations",
  internalAuditRoleCode: "The Internal Audit office for evaluations",
} as const;

export const READER_OFFICE_UNSET = {
  secretariatRoleCode: "Not set: no office reads evaluations as the Secretariat.",
  internalAuditRoleCode: "Not set: no office reads evaluations as Internal Audit.",
} as const;

