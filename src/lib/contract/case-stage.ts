/**
 * Where a case stands: the award and the contract formed from it read as one case (Award and Contract Requirements v2, C-1;
 * design note 0004 §6.1; ruling AC-17). Pure.
 *
 * A case is one Award, with the Contract issued from it once there is one. It is either live, in one of five stages, or it
 * has ended, in one of three ways. The Contracts list (C-1) and the dashboard's Contracts card (GN-03, AC-12) both read it
 * from here, so each case is counted in exactly one place.
 *
 * Precedence, first match wins (AC-17):
 *  1. ENDED: the award CANCELLED with no contract; the contract CANCELLED; the contract TERMINATED.
 *  2. CLOSED: the contract CLOSED.
 *  3. COMPLETED: the contract PRACTICALLY_COMPLETE, MAKING_GOOD_COMPLETE or FINAL_CERTIFICATE_ISSUED.
 *  4. ON_SITE: the contract ACTIVE; or a work indent with commencement recorded, whatever the contract status, because the
 *     contract code has no indent branch and possession may never be written.
 *  5. AWARDING: the award not yet ACCEPTED (DRAFT to ISSUED), whatever the contract status: preparation may already run.
 *  6. SIGNING: everything else (the award ACCEPTED, the contract NUMBER_ALLOCATED to STAMPED).
 *
 * The rule is followed as written, including for pairs no act writes (an award cancelled while its contract is live, which
 * the award's cancel act prevents by cancelling the contract with it; an accepted award with no contract). Those fall through
 * to SIGNING or ON_SITE by rules 4 to 6; the decisions log carries the question (2026-10-17, wave G step G3).
 *
 * `CASE_STAGE_WHERE` is the same rule as a database filter on the Award table, for lists and counts. Every fragment is
 * written positively (`in`, `is: null`, `is: { … }`), never as a NOT over a nullable relation, whose SQL NULL would drop
 * rows. `case-stage.test.ts` proves the two agree on every combination of award status, contract status, instrument and
 * commencement; the database proof is G4's.
 */

import type { Prisma } from "@/generated/prisma/client";

import type { AwardStatus, InstrumentKind } from "@/lib/award/types";

import type { ContractStatus } from "./types";

export type CaseStage = "AWARDING" | "SIGNING" | "ON_SITE" | "COMPLETED" | "CLOSED";
export type CaseEnded = "CANCELLED_BEFORE_ISSUE" | "CONTRACT_CANCELLED" | "TERMINATED";

export interface CaseStageInput {
  award: { status: AwardStatus; instrumentKind: InstrumentKind };
  contract: { status: ContractStatus } | null;
  /** `Award.commencedOn` as an organisation day; null until commencement is recorded. */
  commencement: { commencedOn: string | null };
}

export type CaseStanding = { kind: "LIVE"; stage: CaseStage } | { kind: "ENDED"; ended: CaseEnded };

/// The five live stages, in the order a case passes through them.
export const CASE_STAGES: readonly CaseStage[] = ["AWARDING", "SIGNING", "ON_SITE", "COMPLETED", "CLOSED"];

/// The award statuses before acceptance: the case is still being awarded (rule 5).
export const AWARDING_AWARD_STATUSES: readonly AwardStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED"];

/// The contract statuses from number allocation to stamping: formed, not yet in force (rule 6).
export const BEFORE_ACTIVE_CONTRACT_STATUSES: readonly ContractStatus[] = [
  "NUMBER_ALLOCATED",
  "IN_PREPARATION",
  "PENDING_LEGAL_ENDORSEMENT",
  "RETURNED_FOR_AMENDMENT",
  "LEGALLY_ENDORSED",
  "EXECUTED",
  "STAMPED",
];

/// The stored statuses after Active that mean the works are complete (rule 3).
export const COMPLETED_CONTRACT_STATUSES: readonly ContractStatus[] = ["PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED"];

/// The contract statuses that end a case (rule 1).
export const ENDED_CONTRACT_STATUSES: readonly ContractStatus[] = ["CANCELLED", "TERMINATED"];

const has = <T>(list: readonly T[], v: T) => list.includes(v);

/// Rule 4's indent branch: a work indent whose commencement is recorded.
const indentCommenced = (i: CaseStageInput) => i.award.instrumentKind === "WORK_INDENT" && i.commencement.commencedOn !== null;

export function caseStage(input: CaseStageInput): CaseStanding {
  const { award, contract } = input;
  // 1. Ended.
  if (!contract && award.status === "CANCELLED") return { kind: "ENDED", ended: "CANCELLED_BEFORE_ISSUE" };
  if (contract?.status === "CANCELLED") return { kind: "ENDED", ended: "CONTRACT_CANCELLED" };
  if (contract?.status === "TERMINATED") return { kind: "ENDED", ended: "TERMINATED" };
  // 2. Closed.
  if (contract?.status === "CLOSED") return { kind: "LIVE", stage: "CLOSED" };
  // 3. Completed.
  if (contract && has(COMPLETED_CONTRACT_STATUSES, contract.status)) return { kind: "LIVE", stage: "COMPLETED" };
  // 4. On site.
  if (contract?.status === "ACTIVE" || indentCommenced(input)) return { kind: "LIVE", stage: "ON_SITE" };
  // 5. Awarding.
  if (has(AWARDING_AWARD_STATUSES, award.status)) return { kind: "LIVE", stage: "AWARDING" };
  // 6. Signing.
  return { kind: "LIVE", stage: "SIGNING" };
}

/// The key a standing is filed under in `CASE_STAGE_WHERE`: its stage, or ENDED for all three ended kinds.
export const caseStageKey = (s: CaseStanding): CaseStage | "ENDED" => (s.kind === "LIVE" ? s.stage : "ENDED");

// ------------------------------------------------------------------ the database twin

const contractIn = (statuses: readonly ContractStatus[]): Prisma.AwardWhereInput => ({ contract: { is: { status: { in: [...statuses] } } } });
const NO_CONTRACT: Prisma.AwardWhereInput = { contract: { is: null } };
/// No contract yet, or one formed and not yet in force: the only contract states rules 4 (indent branch) to 6 can see.
const NO_CONTRACT_OR_BEFORE_ACTIVE: Prisma.AwardWhereInput = { OR: [NO_CONTRACT, contractIn(BEFORE_ACTIVE_CONTRACT_STATUSES)] };
/// Rule 4's indent branch, and its complement, both positive. `instrumentKind` is required, so its `not` is plain `<>`.
const INDENT_COMMENCED: Prisma.AwardWhereInput = { instrumentKind: "WORK_INDENT", commencedOn: { not: null } };
const NOT_INDENT_COMMENCED: Prisma.AwardWhereInput = { OR: [{ instrumentKind: { not: "WORK_INDENT" } }, { commencedOn: null }] };
const AFTER_AWARDING_AWARD_STATUSES = (["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED", "CANCELLED"] as const satisfies readonly AwardStatus[]).filter(
  (s) => !has(AWARDING_AWARD_STATUSES, s),
);

/// `caseStage` as a filter on the Award table, one fragment per stage and one for every ended kind. Exactly one matches any award.
export const CASE_STAGE_WHERE: Readonly<Record<CaseStage | "ENDED", Prisma.AwardWhereInput>> = {
  ENDED: { OR: [{ status: "CANCELLED", ...NO_CONTRACT }, contractIn(ENDED_CONTRACT_STATUSES)] },
  CLOSED: contractIn(["CLOSED"]),
  COMPLETED: contractIn(COMPLETED_CONTRACT_STATUSES),
  ON_SITE: {
    OR: [
      contractIn(["ACTIVE"]),
      // An indent with no contract is ended by rule 1 if its award is cancelled, so only a live award is on site here.
      { AND: [INDENT_COMMENCED, { OR: [{ status: { not: "CANCELLED" }, ...NO_CONTRACT }, contractIn(BEFORE_ACTIVE_CONTRACT_STATUSES)] }] },
    ],
  },
  AWARDING: { AND: [{ status: { in: [...AWARDING_AWARD_STATUSES] } }, NO_CONTRACT_OR_BEFORE_ACTIVE, NOT_INDENT_COMMENCED] },
  SIGNING: {
    AND: [
      { OR: [{ status: { in: ["ACCEPTED"] }, ...NO_CONTRACT }, { status: { in: [...AFTER_AWARDING_AWARD_STATUSES] }, ...contractIn(BEFORE_ACTIVE_CONTRACT_STATUSES) }] },
      NOT_INDENT_COMMENCED,
    ],
  },
};
