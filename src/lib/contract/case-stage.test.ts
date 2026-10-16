import { describe, expect, it } from "vitest";

import { AWARD_STATUSES, type AwardStatus, type InstrumentKind } from "@/lib/award/types";
import { whereMatches } from "@/lib/test-support/where-match";

import {
  AWARDING_AWARD_STATUSES,
  BEFORE_ACTIVE_CONTRACT_STATUSES,
  CASE_STAGE_WHERE,
  COMPLETED_CONTRACT_STATUSES,
  ENDED_CONTRACT_STATUSES,
  caseStage,
  caseStageKey,
  type CaseStageInput,
} from "./case-stage";
import { CONTRACT_STATUSES, type ContractStatus } from "./types";

const at = (award: AwardStatus, contract: ContractStatus | null, kind: InstrumentKind = "LETTER_OF_ACCEPTANCE", commencedOn: string | null = null): CaseStageInput => ({
  award: { status: award, instrumentKind: kind },
  contract: contract ? { status: contract } : null,
  commencement: { commencedOn },
});
const keyOf = (i: CaseStageInput) => caseStageKey(caseStage(i));

// ------------------------------------------------------------------ every award status by every contract status

// The expected answer for a letter of acceptance with no commencement, written out by hand from AC-17, not computed from the
// rule. Columns: no contract, then the fourteen contract statuses in `CONTRACT_STATUSES` order.
//   N  = no contract     NA = NUMBER_ALLOCATED  Cx = CANCELLED          IP = IN_PREPARATION   PL = PENDING_LEGAL_ENDORSEMENT
//   RA = RETURNED_FOR_AMENDMENT                 LE = LEGALLY_ENDORSED   EX = EXECUTED         ST = STAMPED
//   AC = ACTIVE          PC = PRACTICALLY_COMPLETE                      MG = MAKING_GOOD_COMPLETE
//   FC = FINAL_CERTIFICATE_ISSUED               TE = TERMINATED         CL = CLOSED
// Reachable today: DRAFT to APPROVED with no contract (issue creates it); ISSUED and ACCEPTED with one; CANCELLED with none
// (cancelled before issue) or with a CANCELLED one (the cancel act cancels the contract with the award). Every other pair is
// one no act writes; it is pinned here so the rule's answer for it is a decision, not an accident (decisions log, G3).
const COLUMNS = [null, ...CONTRACT_STATUSES] as const;
const A = "AWARDING", S = "SIGNING", O = "ON_SITE", D = "COMPLETED", L = "CLOSED", E = "ENDED";
const EXPECTED: Record<AwardStatus, readonly string[]> = {
  //               N  NA Cx IP PL RA LE EX ST AC PC MG FC TE CL
  DRAFT:            [A, A, E, A, A, A, A, A, A, O, D, D, D, E, L],
  PENDING_APPROVAL: [A, A, E, A, A, A, A, A, A, O, D, D, D, E, L],
  APPROVED:         [A, A, E, A, A, A, A, A, A, O, D, D, D, E, L],
  ISSUED:           [A, A, E, A, A, A, A, A, A, O, D, D, D, E, L],
  ACCEPTED:         [S, S, E, S, S, S, S, S, S, O, D, D, D, E, L],
  CANCELLED:        [E, S, E, S, S, S, S, S, S, O, D, D, D, E, L],
};

describe("caseStage: every award status by every contract status (AC-17)", () => {
  it("the table covers every status, and its columns follow CONTRACT_STATUSES", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...AWARD_STATUSES].sort());
    expect(COLUMNS).toHaveLength(15);
  });
  for (const award of AWARD_STATUSES) {
    COLUMNS.forEach((contract, i) => {
      it(`${award} with ${contract ?? "no contract"} is ${EXPECTED[award][i]}`, () => {
        expect(keyOf(at(award, contract))).toBe(EXPECTED[award][i]);
      });
    });
  }
});

describe("caseStage: the named cases", () => {
  it("an issued award stays Awarding while the contract is prepared", () => {
    expect(caseStage(at("ISSUED", "IN_PREPARATION"))).toEqual({ kind: "LIVE", stage: "AWARDING" });
    expect(caseStage(at("ISSUED", "PENDING_LEGAL_ENDORSEMENT"))).toEqual({ kind: "LIVE", stage: "AWARDING" });
  });
  it("an accepted award with its contract before Active is Signing", () => {
    expect(caseStage(at("ACCEPTED", "NUMBER_ALLOCATED"))).toEqual({ kind: "LIVE", stage: "SIGNING" });
    expect(caseStage(at("ACCEPTED", "STAMPED"))).toEqual({ kind: "LIVE", stage: "SIGNING" });
  });
  it("an Active contract is On site", () => {
    expect(caseStage(at("ACCEPTED", "ACTIVE"))).toEqual({ kind: "LIVE", stage: "ON_SITE" });
  });
  it("a work indent with commencement recorded and no possession is On site, whatever the contract status before Active", () => {
    for (const award of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED"] as const) {
      expect(caseStage(at(award, null, "WORK_INDENT", "2026-09-01"))).toEqual({ kind: "LIVE", stage: "ON_SITE" });
      for (const c of BEFORE_ACTIVE_CONTRACT_STATUSES) expect(caseStage(at(award, c, "WORK_INDENT", "2026-09-01"))).toEqual({ kind: "LIVE", stage: "ON_SITE" });
    }
  });
  it("a work indent not yet commenced follows the letter's stages", () => {
    expect(keyOf(at("ISSUED", "NUMBER_ALLOCATED", "WORK_INDENT"))).toBe("AWARDING");
    expect(keyOf(at("ACCEPTED", "NUMBER_ALLOCATED", "WORK_INDENT"))).toBe("SIGNING");
  });
  it("a letter of acceptance is never On site by a commencement date alone", () => {
    expect(keyOf(at("ISSUED", "IN_PREPARATION", "LETTER_OF_ACCEPTANCE", "2026-09-01"))).toBe("AWARDING");
    expect(keyOf(at("ACCEPTED", "STAMPED", "LETTER_OF_ACCEPTANCE", "2026-09-01"))).toBe("SIGNING");
  });
  it("completion, closing and every ended kind come before an indent's commencement", () => {
    for (const c of COMPLETED_CONTRACT_STATUSES) expect(keyOf(at("ACCEPTED", c, "WORK_INDENT", "2026-09-01"))).toBe("COMPLETED");
    expect(keyOf(at("ACCEPTED", "CLOSED", "WORK_INDENT", "2026-09-01"))).toBe("CLOSED");
    expect(caseStage(at("CANCELLED", null, "WORK_INDENT", "2026-09-01"))).toEqual({ kind: "ENDED", ended: "CANCELLED_BEFORE_ISSUE" });
    expect(caseStage(at("CANCELLED", "CANCELLED", "WORK_INDENT", "2026-09-01"))).toEqual({ kind: "ENDED", ended: "CONTRACT_CANCELLED" });
    expect(caseStage(at("ACCEPTED", "TERMINATED", "WORK_INDENT", "2026-09-01"))).toEqual({ kind: "ENDED", ended: "TERMINATED" });
  });
});

describe("caseStage: the three ended kinds", () => {
  it("an award cancelled before issue, with no contract", () => {
    expect(caseStage(at("CANCELLED", null))).toEqual({ kind: "ENDED", ended: "CANCELLED_BEFORE_ISSUE" });
  });
  it("a contract cancelled, whatever its award says", () => {
    for (const a of AWARD_STATUSES) expect(caseStage(at(a, "CANCELLED"))).toEqual({ kind: "ENDED", ended: "CONTRACT_CANCELLED" });
  });
  it("a contract terminated, whatever its award says", () => {
    for (const a of AWARD_STATUSES) expect(caseStage(at(a, "TERMINATED"))).toEqual({ kind: "ENDED", ended: "TERMINATED" });
  });
});

describe("the status sets", () => {
  it("split the contract statuses into before Active, Active, completed, closed and ended, each once", () => {
    const placed = [...BEFORE_ACTIVE_CONTRACT_STATUSES, "ACTIVE", ...COMPLETED_CONTRACT_STATUSES, "CLOSED", ...ENDED_CONTRACT_STATUSES];
    expect([...placed].sort()).toEqual([...CONTRACT_STATUSES].sort());
  });
  it("Awarding holds the award statuses before acceptance", () => {
    expect(AWARDING_AWARD_STATUSES).toEqual(["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED"]);
  });
});

// ------------------------------------------------------------------ the database twin agrees

describe("CASE_STAGE_WHERE agrees with caseStage", () => {
  const rowOf = (i: CaseStageInput) => ({
    status: i.award.status,
    instrumentKind: i.award.instrumentKind,
    commencedOn: i.commencement.commencedOn,
    contract: i.contract ? { status: i.contract.status } : null,
  });
  const KINDS: readonly InstrumentKind[] = ["LETTER_OF_ACCEPTANCE", "WORK_INDENT"];
  const combos: CaseStageInput[] = [];
  for (const a of AWARD_STATUSES) for (const c of COLUMNS) for (const k of KINDS) for (const d of [null, "2026-09-01"]) combos.push(at(a, c, k, d));

  it("covers all 360 combinations", () => expect(combos).toHaveLength(6 * 15 * 2 * 2));
  it("exactly one fragment matches each combination, and it is the pure rule's answer", () => {
    for (const i of combos) {
      const hits = Object.entries(CASE_STAGE_WHERE).filter(([, w]) => whereMatches(rowOf(i), w as Record<string, unknown>)).map(([k]) => k);
      expect({ i, hits }).toEqual({ i, hits: [keyOf(i)] });
    }
  });
});
