import { holds, permissionState, type HeldAssignment, type StoredGrant } from "./permissions";
import type { PermissionKey } from "./types";

/**
 * Who could do an act that needs a permission (ADR 0034 D15, Phase 2c). Pure.
 *
 * A second person is needed for a change or an issue, and the product never fakes one: before it offers the act, a screen asks who besides the maker could do
 * it. The answer is judged exactly as a request is (`permissionState`), so the offer and the refusal cannot disagree. Only a person who can sign in counts: an
 * active account, of an active person. A temporary lock does not take someone out, because it ends.
 */

export interface Candidate {
  personId: string;
  isAdministrator: boolean;
  /// Every assignment the person has held: the ones not in force today are ignored by the rule.
  assignments: readonly HeldAssignment[];
}

/// The Persons among `candidates` who hold `key` on `today` (the organisation's day: null where no time zone is set, which no role carries a permission on).
export function eligiblePersonIds(key: PermissionKey, candidates: readonly Candidate[], grants: readonly StoredGrant[], today: Date | null): string[] {
  return candidates
    .filter((c) => holds(permissionState(key, { isAdministrator: c.isAdministrator, assignments: c.assignments, grants, today })))
    .map((c) => c.personId);
}
