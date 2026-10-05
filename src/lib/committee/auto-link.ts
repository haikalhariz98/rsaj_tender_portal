/**
 * The outcome flows back by itself (founder, 2026-10-05). When a sitting records a matter's outcome, the step of the
 * record's approval it was tabled for is discharged in the same act, by the record's own "Cite committee decision"
 * function, with that function's rules, refusals and audit. This decides only which step the outcome is offered to:
 *
 * - Only a decided outcome is offered (carried or not carried). A deferral decides nothing; a withdrawn matter is off
 *   the agenda. Neither is offered, and nothing is said.
 * - A manual matter names no record, and a matter of another kind on the record (a requisition's gate, a scope, a
 *   funder's consent) answers no route: not offered, nothing said.
 * - Otherwise, the record's open route of the matter's approval (its domain), at its earliest step that is before the
 *   matter's committee, still pending and citing nothing. A step already decided, cited by hand or otherwise, is never
 *   offered, so nothing is discharged twice. None: said ("NO_STEP"), so the sitting can show why nothing was linked.
 *
 * The step is offered whether or not the route has reached it: where an earlier step is still pending, the record's
 * rule refuses it in its own words (steps are decided in order), the outcome stands, and the matter is cited by hand
 * once the route reaches the step. Pure.
 */

import { AUTO_LINK_WORDS } from "./labels";

export interface LinkRoute {
  routeId: string;
  /// As `WaitingRoute.recordKey` (waiting.ts).
  recordKey: string;
  domain: string;
  status: string;
  steps: readonly { id: string; sequence: number; committeeCode: string | null; decision: string; committeeDecisionId: string | null }[];
}

export interface LinkMatter {
  /// As `matterKey` (waiting-load.ts); null for a manual matter.
  recordKey: string | null;
  domain: string;
  committeeCode: string;
  outcome: string;
  withdrawn: boolean;
}

export type LinkTarget =
  | { kind: "STEP"; routeId: string; stepId: string }
  | { kind: "NONE"; why: "NOT_DECIDED" | "NO_RECORD" | "NOT_A_ROUTE_MATTER" | "NO_STEP" };

/// Whether a matter that was not linked is worth a word on the sitting: only where a step was looked for and not found.
export const linkNoteAsked = (t: LinkTarget) => t.kind === "NONE" && t.why === "NO_STEP";

export function autoLinkTarget(m: LinkMatter, routes: readonly LinkRoute[]): LinkTarget {
  if (m.withdrawn || (m.outcome !== "CARRIED" && m.outcome !== "NOT_CARRIED")) return { kind: "NONE", why: "NOT_DECIDED" };
  if (m.recordKey == null) return { kind: "NONE", why: "NO_RECORD" };
  const mine = routes.filter((r) => r.recordKey === m.recordKey && r.domain === m.domain);
  if (mine.length === 0) return { kind: "NONE", why: "NOT_A_ROUTE_MATTER" };
  for (const r of mine.filter((x) => x.status === "PENDING")) {
    const s = [...r.steps]
      .sort((a, b) => a.sequence - b.sequence)
      .find((x) => x.committeeCode === m.committeeCode && x.decision === "PENDING" && x.committeeDecisionId == null);
    if (s) return { kind: "STEP", routeId: r.routeId, stepId: s.id };
  }
  return { kind: "NONE", why: "NO_STEP" };
}

/**
 * The sitting's note on each decided matter not linked to its record's approval: the latest "not linked" entry in the
 * matter's History, its reason the words. Shown only while the matter is still uncited; once it is cited by hand the
 * note is history. Pure.
 */
export function notLinkedNotes(
  entries: readonly { entityId: string; at: Date; reason: string; changes: readonly { field: string; after: string | null }[] }[],
  uncited: ReadonlySet<string>,
): Map<string, string> {
  const out = new Map<string, { at: number; why: string }>();
  for (const e of entries) {
    if (!uncited.has(e.entityId)) continue;
    if (!e.changes.some((c) => c.field === "linkedToApproval" && c.after === AUTO_LINK_WORDS.notLinked.en)) continue;
    const prev = out.get(e.entityId);
    if (!prev || prev.at < e.at.getTime()) out.set(e.entityId, { at: e.at.getTime(), why: e.reason });
  }
  return new Map([...out].map(([k, v]) => [k, v.why]));
}
