/**
 * The only builder of case URLs (AC-23; design note 0004 §6.1; ADR 0037, decision 6). Pure.
 *
 * A case is addressed by its contract once there is one, else by its award: `/projects/{contractId ?? awardId}`. The
 * parameters follow in the order stage, tab, section; an empty one is left out, and with none there is no `?`.
 */

import type { CaseAction, CaseStepKey } from "./case-steps";

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

/// The whole query string of a request as the address carried it, to be written back on a redirect (every parameter, and every
/// value of a repeated one), `?` first; empty when there is none. `caseHref` builds the case's own addresses and drops what it
/// does not know (`page`, `waiting`, `answered`); a redirect from an award id to its contract must not.
export function keepQuery(params: Readonly<Record<string, string | readonly string[] | undefined>>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const one of typeof v === "string" ? [v] : v) q.append(k, one);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/// Where the act behind a step's main button lives, for the acts whose drawer sits inside a panel rather than the header: the
/// button is a link to that panel (design note 0004 C5; ADR 0037 F0-2). The section is for a tab that has them.
export const CASE_ACTION_AT: Readonly<Partial<Record<CaseAction, { stage: CaseStepKey; tab: string; section?: string }>>> = {
  RECORD_DESPATCH: { stage: "award", tab: "distribution" },
  RECORD_RETURN: { stage: "award", tab: "return" },
  LODGE_SECURITY: { stage: "before-signing", tab: "securities" },
  VERIFY_SECURITY: { stage: "before-signing", tab: "securities" },
  SUBMIT_TO_LEGAL: { stage: "signing", tab: "formation", section: "legal" },
  RECORD_SIGNATURE: { stage: "signing", tab: "formation", section: "signing" },
  RECORD_STAMPING: { stage: "signing", tab: "formation", section: "signing" },
  RECORD_POSSESSION: { stage: "project", tab: "site", section: "start" },
  // Phase 2 close-out stage B: each act's drawer is on its card (OPEN_CERTIFICATE goes to the certificate's own page instead).
  RAISE_CPC: { stage: "close-out", tab: "completion", section: "completion" },
  ADD_DEFECT: { stage: "close-out", tab: "defects" },
  RAISE_SCHEDULE: { stage: "close-out", tab: "defects", section: "schedule" },
  RAISE_CMGD: { stage: "close-out", tab: "completion", section: "making-good" },
  RELEASE_RETENTION: { stage: "close-out", tab: "completion", section: "retention" },
  RETURN_SECURITY: { stage: "close-out", tab: "completion", section: "securities" },
  // Stage D: the performance card is on the Close tab.
  SCORE_PERFORMANCE: { stage: "close-out", tab: "closure", section: "performance" },
  // Stage C: the final account's cards, and the Close card (RECORD_FINAL_PAYMENT goes to the certificate's own page).
  RAISE_FINAL_ACCOUNT: { stage: "close-out", tab: "final-account", section: "figures" },
  OPEN_FINAL_ACCOUNT: { stage: "close-out", tab: "final-account" },
  CLOSE_CONTRACT: { stage: "close-out", tab: "closure", section: "close" },
};
