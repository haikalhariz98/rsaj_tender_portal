/**
 * Which tab sits under which step of the case (Award and Contract Requirements v2, C-2 and C-6; design note 0004 §6.1; ADR 0037,
 * decision 6, F0-5). Pure.
 *
 * Addresses are `?stage=&tab=&section=` (built only by `caseHref`). History is case-level: `?tab=history` with no stage. Links
 * already persisted still resolve:
 * - `/awards/[id]?tab=` by `awardTabToCase` (C-6): "notices" goes to the exercise (AC-22), "history" is case-level;
 * - a stage-less `?tab=` on `/projects/[id]` by `caseTabToStep` (F0-5), as `StaffNotice.href` rows and the document and
 *   securities views carry it.
 */

import type { CaseStepKey } from "./case-steps";

/// Phase 2 close-out stage B: Close-out has its tabs, so every step does.
export type CaseTabStep = CaseStepKey;

export const CASE_TABS: Readonly<Record<CaseTabStep, readonly string[]>> = {
  // "instrument" is labelled "Letter".
  award: ["overview", "approval", "instrument", "distribution", "return", "routing"],
  // securities: the award's register and the contract's, one tab (F0-4).
  "before-signing": ["conditions", "securities"],
  signing: ["formation", "baseline"],
  // overview: the contract's Overview opens the Project stage (F-1).
  // Phase 2 close-out stage A: "time" after "variations" (EOT is allowed once practically complete, so it stays open then).
  project: ["overview", "team", "site", "payments", "variations", "time", "documents", "submissions"],
  // Phase 2 close-out stage B (plan §3.2): Completion and Defects. Stage D adds Close ("closure") for the performance card, ahead of stage C, which
  // adds the final account before it and the checklist on it.
  "close-out": ["completion", "defects", "closure"],
};

/// The case-level tab: it has no stage.
export const HISTORY_TAB = "history";

/// The ten tab ids `/awards/[id]` had before it became a redirect, for the old `?tab=` links that are still followed (C-6).
export const AWARD_TAB_IDS: readonly string[] = ["overview", "approval", "instrument", "distribution", "return", "notices", "conditions", "securities", "routing", "history"];

const AWARD_STAGE_OF: Readonly<Record<string, CaseTabStep>> = {
  overview: "award",
  approval: "award",
  instrument: "award",
  distribution: "award",
  return: "award",
  routing: "award",
  conditions: "before-signing",
  securities: "before-signing",
};

/// An award tab id, for /awards/[id]?tab= (C-6). "notices" goes to the exercise (AC-22); "history" is case-level; an unknown
/// tab, or none, names nothing (the default step).
export function awardTabToCase(tab: string | undefined): { stage?: CaseStepKey; tab?: string } | { exercise: "notices" } {
  if (tab === "notices") return { exercise: "notices" };
  if (tab === HISTORY_TAB) return { tab: HISTORY_TAB };
  const stage = tab !== undefined && Object.hasOwn(AWARD_STAGE_OF, tab) ? AWARD_STAGE_OF[tab] : undefined;
  return stage && tab ? { stage, tab } : {};
}

/**
 * A stage-less `?tab=` on /projects/[id], as persisted links carry (F0-5):
 * - "overview": Project on a contract (F-1), Award on an award-only case;
 * - "securities": Before signing, on either id;
 * - "history": case level;
 * - any other known tab: its one stage;
 * - an unknown tab, or none: null (the default step).
 */
export function caseTabToStep(tab: string | undefined, hasContract: boolean): { stage: CaseTabStep; tab: string } | { history: true } | null {
  if (tab === undefined) return null;
  if (tab === HISTORY_TAB) return { history: true };
  if (tab === "overview") return { stage: hasContract ? "project" : "award", tab };
  const stage = (Object.keys(CASE_TABS) as CaseTabStep[]).find((s) => CASE_TABS[s].includes(tab));
  return stage ? { stage, tab } : null;
}

/// `?stage=` with a tab not in that stage opens the stage's first tab (F0-5).
export function stageTab(stage: CaseTabStep, tab: string | undefined): string {
  return tab !== undefined && CASE_TABS[stage].includes(tab) ? tab : CASE_TABS[stage][0];
}

/// A `?stage=` value, or undefined for anything else.
export function parseCaseStepKey(v: string | undefined): CaseStepKey | undefined {
  return v === "award" || v === "before-signing" || v === "signing" || v === "project" || v === "close-out" ? v : undefined;
}
