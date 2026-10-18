/**
 * Which step and tab the case page opens, and whose history it shows (Award and Contract Requirements v2, C-2; design note 0004
 * C5; ADR 0037, F0-5 and F0-6). Pure.
 *
 * The address names `?stage=&tab=&section=`; a persisted link names a tab alone (F0-5). Where the address names neither, the
 * case opens on the step `defaultCaseStep` picks. Nothing here decides what a reader may see: `loadCase` has answered that, and
 * the page only turns the answer into the Award stage's refusal (AC-18).
 */

import { caseTabToStep, HISTORY_TAB, parseCaseStepKey, stageTab } from "./case-tabs";
import { defaultCaseStep, type CaseStep, type CaseStepKey } from "./case-steps";
import type { CaseStanding } from "./case-stage";
import type { CaseVisibility } from "./case-visibility";

export interface CaseViewInput {
  stage: string | undefined;
  tab: string | undefined;
  steps: readonly CaseStep[];
  standing: CaseStanding;
  hasContract: boolean;
  visibility: Exclude<CaseVisibility, "HIDDEN">;
}

export interface CaseView {
  /// The step the bar marks as the one being viewed.
  stage: CaseStepKey;
  /// The tab open under it: null on Close-out (it has none) and on History (case-level).
  tab: string | null;
  /// The case-level History tab is open.
  history: boolean;
  /// The Award stage was asked for by a reader who sees the contract stages only (AC-18): it is refused, not rendered.
  awardRefused: boolean;
  /// A contract stage was asked for on a case with no Contract row yet: the page says what the stage waits for, nothing more.
  noContractYet: boolean;
}

export function resolveCaseView(i: CaseViewInput): CaseView {
  const fallback = defaultCaseStep(i.steps, i.standing);
  const named = parseCaseStepKey(i.stage);
  let stage: CaseStepKey;
  let tab: string | null;
  let history = false;
  if (i.tab === HISTORY_TAB) {
    // History is case-level. A stage in the address only says which step stays marked.
    stage = named ?? fallback;
    tab = null;
    history = true;
  } else if (named) {
    stage = named;
    tab = named === "close-out" ? null : stageTab(named, i.tab);
  } else {
    const mapped = caseTabToStep(i.tab, i.hasContract);
    if (mapped && "stage" in mapped) {
      stage = mapped.stage;
      tab = mapped.tab;
    } else {
      stage = fallback;
      tab = stage === "close-out" ? null : stageTab(stage, undefined);
    }
  }
  const awardRefused = !history && stage === "award" && i.visibility === "CONTRACT_STAGES_ONLY";
  const noContractYet = !history && !i.hasContract && stage !== "award" && stage !== "close-out";
  return { stage, tab, history, awardRefused, noContractYet };
}

/// Whose audit rows the case-level History reads. A reader who sees the contract stages only has the contract's rows alone: the
/// award's trail (awardHistory) is the Award stage's, which is refused to them (AC-18, ADR 0037 §6.1 table).
export function caseHistorySources(i: { hasContract: boolean; visibility: Exclude<CaseVisibility, "HIDDEN"> }): ("award" | "contract")[] {
  if (i.visibility === "CONTRACT_STAGES_ONLY") return ["contract"];
  return i.hasContract ? ["award", "contract"] : ["award"];
}
