/**
 * The only builder of case URLs (AC-23; design note 0004 §6.1; ADR 0037, decision 6). Pure.
 *
 * A case is addressed by its contract once there is one, else by its award: `/projects/{contractId ?? awardId}`. The
 * parameters follow in the order stage, tab, section; an empty one is left out, and with none there is no `?`.
 */

import type { CaseStepKey } from "./case-steps";

export interface CaseRef {
  awardId: string;
  contractId: string | null;
}

export function caseHref(ref: CaseRef, at?: { stage?: CaseStepKey; tab?: string; section?: string }): string {
  const path = `/projects/${encodeURIComponent(ref.contractId || ref.awardId)}`;
  const q = new URLSearchParams();
  if (at?.stage) q.set("stage", at.stage);
  if (at?.tab) q.set("tab", at.tab);
  if (at?.section) q.set("section", at.section);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
