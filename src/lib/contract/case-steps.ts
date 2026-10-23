/**
 * The case's step bar (Award and Contract Requirements v2, C-2; design note 0004 §6.1; ADR 0037, decision 5). Pure.
 *
 * Five steps, Award, Before signing, Signing, Project and Close-out, each with its own state. Several may be in progress at
 * once: preparation may run while the conditions before signing are still red (FR-CON-008).
 *
 * It never adds a gate (F0-2, AC-20). The page computes every `*Offered`, `issueReady` and `blocker` fact from the condition
 * today's screens use, at the line cited on each fact; this file only orders them and turns them into a state, a "next" line
 * and at most one action per step. Where an act today shows Blocked, the action is null and the block's words are `next`.
 *
 * The words are written for any reader. A finding's words come from `awardFindingTextFor` in its redacted form (no figures,
 * no comparison with the recommendation), because this file cannot know the reader's SULIT gates; the panels below the bar
 * carry the full text for a reader who may have it. A gate item's words come from its label, never from its `detail`, which
 * carries sums.
 *
 * Then two rules apply over all five steps:
 * - CONTRACT_STAGES_ONLY (AC-18): no act in `AWARD_ACTS` is offered, because each runs through `withLockedAwardFor`, which
 *   refuses this reader today;
 * - an ended case: no action anywhere, and nothing reads as in progress (F0-6).
 */

import type { CommencementState } from "@/lib/award/commencement";
import { GATE_LABEL, GATE_STATE_LABEL, awardFindingTextFor } from "@/lib/award/labels";
import type { readinessGate } from "@/lib/award/readiness";
import type { AwardStatus, Finding, InstrumentKind } from "@/lib/award/types";

import { BEFORE_ACTIVE_CONTRACT_STATUSES, COMPLETED_CONTRACT_STATUSES, type CaseEnded, type CaseStage, type CaseStanding } from "./case-stage";
import type { CaseVisibility } from "./case-visibility";
import type { ContractStatus } from "./types";

export type CaseStepKey = "award" | "before-signing" | "signing" | "project" | "close-out";
export type CaseStepState = "done" | "in-progress" | "waiting" | "parked";
export type CaseAction =
  | "SEND_FOR_APPROVAL"
  | "ISSUE"
  | "RECORD_DESPATCH"
  | "RECORD_RETURN"
  | "RECORD_COMMENCEMENT"
  | "LODGE_SECURITY"
  | "VERIFY_SECURITY"
  | "START_PREPARATION"
  | "SUBMIT_TO_LEGAL"
  | "RECORD_SIGNATURE"
  | "RECORD_STAMPING"
  | "RECORD_POSSESSION";

/// The five steps, in the order the bar shows them.
export const CASE_STEP_KEYS: readonly CaseStepKey[] = ["award", "before-signing", "signing", "project", "close-out"];

/// The acts that run through withLockedAwardFor: never offered under CONTRACT_STAGES_ONLY.
export const AWARD_ACTS: readonly CaseAction[] = ["SEND_FOR_APPROVAL", "ISSUE", "RECORD_DESPATCH", "RECORD_RETURN", "RECORD_COMMENCEMENT", "LODGE_SECURITY", "VERIFY_SECURITY"];

/// What a step's `next` line says when its action is offered.
export const CASE_ACTION_NEXT: Readonly<Record<CaseAction, string>> = {
  SEND_FOR_APPROVAL: "Ready to send for approval",
  ISSUE: "Ready to issue",
  RECORD_DESPATCH: "Record the despatch of each copy",
  RECORD_RETURN: "Record the contractor's return",
  RECORD_COMMENCEMENT: "Record when work commences",
  LODGE_SECURITY: "Lodge the performance bond or the insurance policies",
  VERIFY_SECURITY: "Verify the securities lodged",
  START_PREPARATION: "Start preparing the contract document",
  SUBMIT_TO_LEGAL: "Send the contract document to the legal office",
  RECORD_SIGNATURE: "Record the signatures",
  RECORD_STAMPING: "Record the stamping",
  RECORD_POSSESSION: "Record possession of site",
};

export interface CaseStep {
  key: CaseStepKey;
  state: CaseStepState;
  /// Label words, never a code.
  next: string;
  action: CaseAction | null;
}

/// Each fact is today's own condition, computed by the page at the line cited (F0-1, F0-2). Nothing here is re-derived.
export interface AwardStepFacts {
  status: AwardStatus;
  instrumentKind: InstrumentKind;
  /// ev.submitFaults at level "block" (awards/[id]/page.tsx:200).
  submitBlocks: readonly Finding[];
  /// awards/[id]/page.tsx:206: APPROVED, no issue fault, the signatory resolved.
  issueReady: boolean;
  /// ev.issueFaults, for the "next" words when not ready.
  issueFaults: readonly Finding[];
  /// Distribution rows whose DespatchDrawer renders (awards/[id]/page.tsx:1055).
  despatchOpen: number;
  /// awards/[id]/page.tsx:1110: ISSUED or ACCEPTED, and the panel's SULIT gate GRANTED.
  returnOffered: boolean;
  /// instrumentReturned(kind, awardReturn): for the "next" words only, never a gate on RECORD_RETURN.
  returned: boolean;
  /// ev.commencement, for the "next" words only.
  commencement: CommencementState | null;
  /// awards/[id]/page.tsx:303: ISSUED or ACCEPTED, not a Letter of Acceptance, no commencedOn.
  commencementOffered: boolean;
}

export interface BeforeSigningFacts {
  /// null under CONTRACT_STAGES_ONLY (it reads the award).
  readiness: ReturnType<typeof readinessGate> | null;
  /// LODGED bonds and policies; 0 under CONTRACT_STAGES_ONLY.
  securitiesToVerify: number;
  /// The award SecuritiesPanel's `open` (awards/[id]/page.tsx:1216); false under CONTRACT_STAGES_ONLY.
  lodgeOffered: boolean;
}

export type SigningAct = Extract<CaseAction, "START_PREPARATION" | "SUBMIT_TO_LEGAL" | "RECORD_SIGNATURE" | "RECORD_STAMPING" | "RECORD_POSSESSION">;

export interface SigningFacts {
  status: ContractStatus;
  /// The act today's page offers for this status (ADR 0037 F0-11), with its Blocked words already rendered (contractFaultText);
  /// null where none is offered (PENDING_LEGAL_ENDORSEMENT, or the possession's office hidden).
  act: { action: SigningAct; blocker: string | null } | null;
}

export interface CaseFacts {
  /// The page has already answered 404 for HIDDEN.
  visibility: Exclude<CaseVisibility, "HIDDEN">;
  standing: CaseStanding;
  /// null under CONTRACT_STAGES_ONLY: the award readers do not run.
  award: AwardStepFacts | null;
  /// null before issue (no Contract row; lodging only after issue, R-4).
  beforeSigning: BeforeSigningFacts | null;
  /// null without a Contract row.
  signing: SigningFacts | null;
}

/// A set of facts no page computes. It names the rule it breaks.
export class CaseFactsError extends Error {
  constructor(
    readonly rule: "AWARD_FACTS_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "CaseFactsError";
  }
}

// ------------------------------------------------------------------ words

const NOT_ISSUED_YET = "Opens once the award is issued";
/// AC-67: this stage is open before issue for the award's conditions and bond requirement (AC-36), so it never says it is closed.
const CONDITIONS_AFTER_ISSUE = "Conditions are checked once the award is issued";
const RESTRICTED_AWARD = "The award stage is restricted to those named on its exercise";
const RESTRICTED_CONDITIONS = "Adding and settling conditions is restricted; the contract's securities are shown";
export const CLOSE_OUT_PARKED = "Parked until after go-live";
/// Where an ended case ended (F0-6), on the step it ended at.
export const CASE_ENDED_WORDS: Readonly<Record<CaseEnded, string>> = {
  CANCELLED_BEFORE_ISSUE: "The award was cancelled before issue",
  CONTRACT_CANCELLED: "The contract was cancelled",
  TERMINATED: "The contract was terminated",
};
const NOT_REACHED = "Not reached: the case has ended";

/// A finding's words for any reader: no figures, no comparison with the recommendation (both SULIT).
const findingWords = (f: Finding) => awardFindingTextFor(f, false, false);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/// Signing's words when no act is offered for the status (F0-11), or the step is not in progress.
const SIGNING_WORDS: Readonly<Partial<Record<ContractStatus, string>>> = {
  NUMBER_ALLOCATED: "Preparation of the contract document has not started",
  IN_PREPARATION: "The contract document is in preparation",
  RETURNED_FOR_AMENDMENT: "Returned by the legal office for amendment",
  PENDING_LEGAL_ENDORSEMENT: "With the legal office",
  LEGALLY_ENDORSED: "Endorsed, waiting for the signatures",
  EXECUTED: "Signed, waiting for stamping",
  STAMPED: "Stamped, waiting for possession of site",
  CANCELLED: "The contract is cancelled",
};
const signingWords = (s: ContractStatus) => SIGNING_WORDS[s] ?? "The contract is past signing";

const COMMENCEMENT_WORDS: Readonly<Record<CommencementState["state"], string>> = {
  COMMENCED: "Work has commenced",
  NOT_DUE: "Record when work commences",
  LATE: "Work has not commenced within the grace period: record when it does",
  NO_START_DATE: "Record when work commences: the start date is not recorded",
  NOT_SET: "Record when work commences: the grace period is not set",
};

// ------------------------------------------------------------------ status lists

/// The contract statuses at or after signing: the conditions before signing are behind it. TERMINATED counts (a terminated
/// contract was signed); CANCELLED does not (a contract may be cancelled before it is signed).
export const SIGNED_CONTRACT_STATUSES: readonly ContractStatus[] = ["EXECUTED", "STAMPED", "ACTIVE", ...COMPLETED_CONTRACT_STATUSES, "CLOSED", "TERMINATED"];
/// The contract statuses from Active on: Signing is done.
export const IN_FORCE_CONTRACT_STATUSES: readonly ContractStatus[] = ["ACTIVE", ...COMPLETED_CONTRACT_STATUSES, "CLOSED", "TERMINATED"];

// ------------------------------------------------------------------ one step each

type Draft = Omit<CaseStep, "key">;

function awardStep(f: CaseFacts): Draft {
  if (f.visibility === "CONTRACT_STAGES_ONLY") return { state: "waiting", next: RESTRICTED_AWARD, action: null };
  const a = f.award;
  if (!a) throw new CaseFactsError("AWARD_FACTS_REQUIRED", "A case seen whole needs the award's facts: the award readers must run for a reader who sees the whole case.");
  switch (a.status) {
    case "ACCEPTED":
      return { state: "done", next: "The award is accepted", action: null };
    case "CANCELLED":
      return { state: "waiting", next: "The award is cancelled", action: null };
    case "DRAFT":
      return a.submitBlocks.length ? { state: "in-progress", next: findingWords(a.submitBlocks[0]), action: null } : { state: "in-progress", next: CASE_ACTION_NEXT.SEND_FOR_APPROVAL, action: "SEND_FOR_APPROVAL" };
    case "PENDING_APPROVAL":
      return { state: "in-progress", next: "Waiting for approval", action: null };
    case "APPROVED":
      if (a.issueReady) return { state: "in-progress", next: CASE_ACTION_NEXT.ISSUE, action: "ISSUE" };
      return { state: "in-progress", next: a.issueFaults.length ? findingWords(a.issueFaults[0]) : "Signatory not resolved", action: null };
    case "ISSUED":
      if (a.despatchOpen > 0) return { state: "in-progress", next: `${plural(a.despatchOpen, "copy", "copies")} still to despatch`, action: "RECORD_DESPATCH" };
      if (a.returnOffered) return { state: "in-progress", next: a.returned ? "The return is recorded, waiting for acceptance" : CASE_ACTION_NEXT.RECORD_RETURN, action: "RECORD_RETURN" };
      return { state: "in-progress", next: "Waiting for the contractor's return", action: null };
  }
}

function beforeSigningStep(f: CaseFacts): Draft {
  const b = f.beforeSigning;
  if (!b) return { state: "waiting", next: CONDITIONS_AFTER_ISSUE, action: null };
  if (f.signing && SIGNED_CONTRACT_STATUSES.includes(f.signing.status)) return { state: "done", next: "The contract is signed", action: null };
  if (b.readiness?.ready) return { state: "done", next: "Every condition before signing is met", action: null };
  const outstanding = b.readiness?.items.find((i) => i.state !== "MET") ?? null;
  const words = outstanding ? `${GATE_LABEL[outstanding.key]}: ${GATE_STATE_LABEL[outstanding.state].toLowerCase()}` : b.readiness ? "Conditions before signing are outstanding" : RESTRICTED_CONDITIONS;
  if (b.securitiesToVerify > 0) return { state: "in-progress", next: `${plural(b.securitiesToVerify, "security", "securities")} lodged, waiting for verification`, action: "VERIFY_SECURITY" };
  const securityNotMet = b.readiness?.items.some((i) => (i.key === "BOND" || i.key === "INSURANCE") && i.state === "NOT_MET") ?? false;
  if (b.lodgeOffered && securityNotMet) return { state: "in-progress", next: words, action: "LODGE_SECURITY" };
  return { state: "in-progress", next: words, action: null };
}

function signingStep(f: CaseFacts): Draft {
  const s = f.signing;
  if (!s) return { state: "waiting", next: NOT_ISSUED_YET, action: null };
  if (IN_FORCE_CONTRACT_STATUSES.includes(s.status)) return { state: "done", next: "The contract is signed and stamped", action: null };
  if (!BEFORE_ACTIVE_CONTRACT_STATUSES.includes(s.status)) return { state: "waiting", next: signingWords(s.status), action: null };
  if (s.act && s.act.blocker == null) return { state: "in-progress", next: CASE_ACTION_NEXT[s.act.action], action: s.act.action };
  return { state: "in-progress", next: s.act?.blocker ?? signingWords(s.status), action: null };
}

function projectStep(f: CaseFacts): Draft {
  const stage = f.standing.kind === "LIVE" ? f.standing.stage : null;
  if (stage === "CLOSED") return { state: "done", next: "The contract is closed", action: null };
  const offered = f.award?.commencementOffered ?? false;
  if (offered) {
    const words = f.award?.commencement ? COMMENCEMENT_WORDS[f.award.commencement.state] : CASE_ACTION_NEXT.RECORD_COMMENCEMENT;
    return { state: "in-progress", next: words, action: "RECORD_COMMENCEMENT" };
  }
  if (stage === "ON_SITE") return { state: "in-progress", next: "On site", action: null };
  if (stage === "COMPLETED") return { state: "in-progress", next: f.signing ? COMPLETED_WORDS[f.signing.status] ?? "The works are complete" : "The works are complete", action: null };
  return { state: "waiting", next: "Opens once the contract is in force", action: null };
}

/// What the Project step says once the works are complete, by the contract's status.
const COMPLETED_WORDS: Readonly<Partial<Record<ContractStatus, string>>> = {
  PRACTICALLY_COMPLETE: "The works are practically complete",
  MAKING_GOOD_COMPLETE: "Making good of defects is complete",
  FINAL_CERTIFICATE_ISSUED: "The final certificate is issued",
};

/// Where an ended case ended (F0-6): the step that carries its words and opens by default.
export const CASE_ENDED_STEP: Readonly<Record<CaseEnded, CaseStepKey>> = {
  CANCELLED_BEFORE_ISSUE: "award",
  CONTRACT_CANCELLED: "signing",
  TERMINATED: "project",
};

// ------------------------------------------------------------------ the bar

/// Always five steps, in `CASE_STEP_KEYS` order.
export function caseSteps(f: CaseFacts): CaseStep[] {
  const drafts: Record<CaseStepKey, Draft> = {
    award: awardStep(f),
    "before-signing": beforeSigningStep(f),
    signing: signingStep(f),
    project: projectStep(f),
    "close-out": { state: "parked", next: CLOSE_OUT_PARKED, action: null },
  };
  return CASE_STEP_KEYS.map((key) => {
    let step: CaseStep = { key, ...drafts[key] };
    // AC-18: an act behind withLockedAwardFor is refused to this reader today, so it is not offered.
    if (f.visibility === "CONTRACT_STAGES_ONLY" && step.action && AWARD_ACTS.includes(step.action)) {
      step = { ...step, action: null, next: key === "before-signing" ? RESTRICTED_CONDITIONS : RESTRICTED_AWARD };
    }
    // F0-6: an ended case offers nothing, and nothing is in progress.
    if (f.standing.kind === "ENDED" && step.state !== "done" && step.state !== "parked") {
      const ended = f.standing.ended;
      step = { ...step, state: "waiting", action: null, next: CASE_ENDED_STEP[ended] === key ? CASE_ENDED_WORDS[ended] : NOT_REACHED };
    }
    return step;
  });
}

/// The first step a live stage can land on: an earlier step still open is a warning on the live stage, never the landing (plan 6.6).
const LIVE_FLOOR: Readonly<Record<CaseStage, CaseStepKey>> = { AWARDING: "award", SIGNING: "before-signing", ON_SITE: "project", COMPLETED: "project", CLOSED: "project" };

/**
 * The step a case opens on when the address names none.
 * - Ended (F0-6): where it ended.
 * - Live: the live stage first (an earlier step left open does not pull the case back to it), then within it the earliest
 *   step with an action; else the last in progress; else the last done; else Award.
 */
export function defaultCaseStep(steps: readonly CaseStep[], standing: CaseStanding): CaseStepKey {
  if (standing.kind === "ENDED") return CASE_ENDED_STEP[standing.ended];
  // Without a contract (signing waiting) the later stages have nothing to show, so the floor stays at Award.
  const floorKey = steps.find((s) => s.key === "signing")?.state === "waiting" ? "award" : LIVE_FLOOR[standing.stage];
  const live = steps.slice(Math.max(0, steps.findIndex((s) => s.key === floorKey)));
  const withAction = live.find((s) => s.action);
  if (withAction) return withAction.key;
  const inProgress = live.filter((s) => s.state === "in-progress").at(-1);
  if (inProgress) return inProgress.key;
  const done = live.filter((s) => s.state === "done").at(-1);
  return done?.key ?? "award";
}

/// The earlier steps of a live case still open while `viewing` is on screen: shown as a warning there, with a link back (plan 6.6).
export function earlierOpenSteps(steps: readonly CaseStep[], standing: CaseStanding, viewing: CaseStepKey): CaseStep[] {
  if (standing.kind === "ENDED") return [];
  const at = CASE_STEP_KEYS.indexOf(viewing);
  return steps.filter((s) => CASE_STEP_KEYS.indexOf(s.key) < at && s.state === "in-progress" && s.key !== "close-out");
}
