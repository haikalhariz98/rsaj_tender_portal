/**
 * What the configuration now judges differently from the exercise as last saved
 * (review #2). The move into preparation records the classification; it refuses where
 * any of it would change unseen, and asks for a re-save — which audits the change.
 */

import type { Finding } from "./types";

export const DRIFT_FIELDS = [
  // A new issue with the same rule and band keys still changes the authority the
  // exercise is classified under (ruling on BD-16).
  ["authorityMatrixId", "the approval matrix issue"],
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

type Keyed = { key: string | null | undefined; label: string | null | undefined };

/**
 * A configured record as the trail names it: compared on its key, shown by its label
 * (6.3 re-review). Labels need not be unique, so a change of key whose labels match
 * still reads as a change; an unchanged key is no change whatever the label says.
 */
export function keyedAuditNames(before: Keyed | null, after: Keyed, noun: string): { before: string | null; after: string | null; changed: boolean } {
  const name = (x: Keyed | null) => (x?.key ? (x.label ?? `A ${noun} no longer on file`) : null);
  const b = name(before);
  let a = name(after);
  const changed = (before?.key ?? null) !== (after.key ?? null);
  if (changed && before?.key && after.key && a === b) a = `${a} (a different ${noun} under the same label)`;
  return { before: b, after: a, changed };
}

type IssueCols = { authorityMatrixId?: string | null; matrixLabel?: string | null };

/// The approval matrix issue as the trail records it: by its label, never its id
/// (ruling on BD-16).
export function issueAuditNames(before: IssueCols | null, after: IssueCols): { before: string | null; after: string | null } {
  const k = (x: IssueCols) => ({ key: x.authorityMatrixId, label: x.matrixLabel });
  const r = keyedAuditNames(before ? k(before) : null, k(after), "issue");
  return { before: r.before, after: r.after };
}
