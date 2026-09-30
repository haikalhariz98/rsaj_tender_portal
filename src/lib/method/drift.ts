/**
 * What the configuration now judges differently from the exercise as last saved
 * (review #2). The move into preparation records the classification; it refuses where
 * any of it would change unseen, and asks for a re-save — which audits the change.
 */

import type { Finding } from "./types";

export const DRIFT_FIELDS = [
  ["contractTypeCode", "the contract type"],
  ["contractTypeState", "how the contract type is reached"],
  ["regime", "the method band"],
  ["appointmentRuleKey", "the rule that approves the appointment"],
  ["termsBandKey", "the contract terms band"],
  ["boundaryOperator", "the rule applied at the boundary"],
  ["restricted", "the restriction"],
  ["proposedMethodCode", "the proposed method"],
] as const;

type Cols = Partial<Record<(typeof DRIFT_FIELDS)[number][0], unknown>>;

export function determinationDrift(stored: Cols, fresh: Cols): Finding<"DETERMINATION_CHANGED">[] {
  const norm = (v: unknown) => (v === undefined ? null : v);
  const changed = DRIFT_FIELDS.filter(([k]) => norm(stored[k]) !== norm(fresh[k])).map(([, label]) => label);
  return changed.length ? [{ code: "DETERMINATION_CHANGED", level: "block", data: { changes: changed.join(", ") } }] : [];
}
