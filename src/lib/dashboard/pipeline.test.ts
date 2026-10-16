import { describe, expect, it } from "vitest";

import { AWARD_STATUSES, type AwardStatus, type InstrumentKind } from "@/lib/award/types";
import { CASE_STAGES, caseStage, caseStageKey } from "@/lib/contract/case-stage";
import { caseVisibility } from "@/lib/contract/case-visibility";
import { EXERCISE_STATUSES } from "@/lib/method/types";
import { STATUS_ORDER } from "@/lib/requisition/labels";
import type { RequisitionStatus } from "@/lib/requisition/types";
import { whereMatches } from "@/lib/test-support/where-match";

import { CASE_PIPELINE, CASE_PIPELINE_WHERE, REQUISITION_PIPELINE, casePipelineWhere, SOURCING_PIPELINE_WHERE, caseInPipeline, requisitionPipelineSplit, sourcingInPipeline } from "./pipeline";

// ------------------------------------------------------------------ requisitions

describe("the Requisitions card's statuses (AC-12)", () => {
  // Every requisition status, placed by hand: on the card, Sourcing's, not raised, or ended.
  const PLACED: Record<RequisitionStatus, "CARD" | "SOURCING" | "NOT_RAISED" | "ENDED"> = {
    DRAFT: "NOT_RAISED",
    ENDORSED: "CARD",
    RETURNED: "CARD",
    REGISTERED: "CARD",
    BUDGET_CHECKED: "CARD",
    OVER_BUDGET: "CARD",
    PENDING_APPROVAL: "CARD",
    REJECTED: "ENDED",
    RECALLED: "CARD",
    APPROVED: "CARD",
    SOURCING: "SOURCING",
    PARTIALLY_FULFILLED: "SOURCING",
    FULFILLED: "ENDED",
    CANCELLED: "ENDED",
    CLOSED: "ENDED",
  };
  it("places every status once", () => {
    expect(Object.keys(PLACED).sort()).toEqual([...STATUS_ORDER].sort());
    expect(STATUS_ORDER).toHaveLength(15);
  });
  it("counts exactly the statuses placed on the card", () => {
    expect([...REQUISITION_PIPELINE].sort()).toEqual(STATUS_ORDER.filter((s) => PLACED[s] === "CARD").sort());
  });
});

describe("requisitionPipelineSplit", () => {
  it("worked example: a whole organisation's breakdown", () => {
    // 2 drafts (not raised), 3 endorsed, 1 registered, 1 over budget, 4 pending approval, 5 approved, 2 returned, 1 recalled,
    // 6 with sourcing, 9 fulfilled, 1 cancelled. On the card: 3 + 1 + 1 + 4 + 5 + 2 + 1 = 17; approved and waiting 5; back
    // with the requester 2 + 1 = 3.
    const byStatus: { status: RequisitionStatus; count: number }[] = [
      { status: "DRAFT", count: 2 },
      { status: "ENDORSED", count: 3 },
      { status: "REGISTERED", count: 1 },
      { status: "OVER_BUDGET", count: 1 },
      { status: "PENDING_APPROVAL", count: 4 },
      { status: "APPROVED", count: 5 },
      { status: "RETURNED", count: 2 },
      { status: "RECALLED", count: 1 },
      { status: "SOURCING", count: 6 },
      { status: "FULFILLED", count: 9 },
      { status: "CANCELLED", count: 1 },
    ];
    expect(requisitionPipelineSplit(byStatus)).toEqual({ total: 17, approvedWaiting: 5, backWithRequester: 3 });
  });
  it("is all zeros for none, or for statuses off the card only", () => {
    expect(requisitionPipelineSplit([])).toEqual({ total: 0, approvedWaiting: 0, backWithRequester: 0 });
    expect(requisitionPipelineSplit([{ status: "DRAFT", count: 4 }, { status: "PARTIALLY_FULFILLED", count: 2 }])).toEqual({ total: 0, approvedWaiting: 0, backWithRequester: 0 });
  });
  it("each status alone counts in the total, and only APPROVED, RETURNED and RECALLED in a hint part", () => {
    for (const s of STATUS_ORDER) {
      const on = REQUISITION_PIPELINE.includes(s);
      expect(requisitionPipelineSplit([{ status: s, count: 1 }])).toEqual({
        total: on ? 1 : 0,
        approvedWaiting: s === "APPROVED" ? 1 : 0,
        backWithRequester: s === "RETURNED" || s === "RECALLED" ? 1 : 0,
      });
    }
  });
});

// ------------------------------------------------------------------ sourcing

describe("sourcingInPipeline (AC-12)", () => {
  it("an open exercise with no award is on the card", () => {
    expect(sourcingInPipeline("ADVERTISED", [])).toBe(true);
  });
  it("an exercise whose only awards were cancelled is back on the card", () => {
    expect(sourcingInPipeline("EVALUATED", ["CANCELLED", "CANCELLED"])).toBe(true);
  });
  it("an exercise with a live award is the Contracts card's, whatever the award's status", () => {
    for (const a of AWARD_STATUSES.filter((s) => s !== "CANCELLED")) expect(sourcingInPipeline("EVALUATED", [a])).toBe(false);
    expect(sourcingInPipeline("EVALUATED", ["CANCELLED", "DRAFT"])).toBe(false);
  });
  it("a cancelled exercise is never on the card", () => {
    expect(sourcingInPipeline("CANCELLED", [])).toBe(false);
  });
  it("SOURCING_PIPELINE_WHERE agrees, on every exercise status by every set of up to two awards", () => {
    const sets: AwardStatus[][] = [[], ...AWARD_STATUSES.map((a) => [a]), ...AWARD_STATUSES.flatMap((a) => AWARD_STATUSES.map((b) => [a, b]))];
    for (const status of EXERCISE_STATUSES)
      for (const awards of sets) {
        const row = { status, awards: awards.map((s) => ({ status: s })) };
        expect({ status, awards, hit: whereMatches(row, SOURCING_PIPELINE_WHERE as Record<string, unknown>) }).toEqual({ status, awards, hit: sourcingInPipeline(status, awards) });
      }
  });
});

// ------------------------------------------------------------------ contracts

describe("the Contracts card (AC-12)", () => {
  it("counts Awarding, Signing and On site; Completed and Closed are left out", () => {
    expect(CASE_PIPELINE).toEqual(["AWARDING", "SIGNING", "ON_SITE"]);
    expect(CASE_STAGES.filter((s) => !(CASE_PIPELINE as readonly string[]).includes(s))).toEqual(["COMPLETED", "CLOSED"]);
    expect(Object.keys(CASE_PIPELINE_WHERE)).toEqual([...CASE_PIPELINE]);
  });
  it("caseInPipeline follows the shared caseStage", () => {
    const on = (award: AwardStatus, contract: Parameters<typeof caseStage>[0]["contract"]) =>
      caseInPipeline(caseStage({ award: { status: award, instrumentKind: "LETTER_OF_ACCEPTANCE" }, contract, commencement: { commencedOn: null } }));
    expect(on("DRAFT", null)).toBe(true);
    expect(on("ACCEPTED", { status: "STAMPED" })).toBe(true);
    expect(on("ACCEPTED", { status: "ACTIVE" })).toBe(true);
    expect(on("ACCEPTED", { status: "PRACTICALLY_COMPLETE" })).toBe(false);
    expect(on("ACCEPTED", { status: "CLOSED" })).toBe(false);
    expect(on("CANCELLED", null)).toBe(false);
    expect(on("ACCEPTED", { status: "TERMINATED" })).toBe(false);
  });
});

describe("casePipelineWhere joins the stage and the visibility rule (AC-12, AC-18)", () => {
  // One case per stage the card counts, on a hidden exercise and on an open one, before and after issue where the stage allows.
  const cases = [
    { stage: "AWARDING", award: "APPROVED", contract: null },
    { stage: "AWARDING", award: "ISSUED", contract: { status: "IN_PREPARATION" } },
    { stage: "SIGNING", award: "ACCEPTED", contract: { status: "STAMPED" } },
    { stage: "ON_SITE", award: "ACCEPTED", contract: { status: "ACTIVE" } },
    { stage: "ON_SITE", award: "ISSUED", contract: null, indent: true },
  ] as const;
  const hidden = ["ex-hidden"];
  for (const c of cases)
    for (const exerciseId of ["ex-hidden", "ex-open"]) {
      const row = { exerciseId, status: c.award, instrumentKind: ("indent" in c ? "WORK_INDENT" : "LETTER_OF_ACCEPTANCE") as InstrumentKind, commencedOn: "indent" in c ? "2026-09-01" : null, contract: c.contract };
      const pureStage = caseStageKey(caseStage({ award: { status: row.status, instrumentKind: row.instrumentKind }, contract: c.contract, commencement: { commencedOn: row.commencedOn } }));
      const seen = caseVisibility({ restricted: exerciseId === "ex-hidden", actorNamed: false, system: false, issued: c.contract !== null }) !== "HIDDEN";
      it(`${c.stage}: ${c.award} with ${c.contract?.status ?? "no contract"} on ${exerciseId} is counted ${seen}`, () => {
        expect(pureStage).toBe(c.stage);
        for (const stage of CASE_PIPELINE) expect(whereMatches(row, casePipelineWhere(stage, hidden) as Record<string, unknown>)).toBe(stage === c.stage && seen);
      });
    }
  it("a hidden exercise's case before issue is left out of every stage, and kept once its contract exists", () => {
    const before = { exerciseId: "ex-hidden", status: "APPROVED", instrumentKind: "LETTER_OF_ACCEPTANCE", commencedOn: null, contract: null };
    const after = { ...before, status: "ACCEPTED", contract: { status: "STAMPED" } };
    for (const stage of CASE_PIPELINE) expect(whereMatches(before, casePipelineWhere(stage, hidden) as Record<string, unknown>)).toBe(false);
    expect(whereMatches(after, casePipelineWhere("SIGNING", hidden) as Record<string, unknown>)).toBe(true);
  });
  it("spreading the stage beside the visibility rule would lose the rule: the reason casePipelineWhere joins them with AND", () => {
    const spread = { ...(casePipelineWhere("ON_SITE", hidden).AND as object[])[0], ...CASE_PIPELINE_WHERE.ON_SITE } as Record<string, unknown>;
    const leaked = { exerciseId: "ex-hidden", status: "ISSUED", instrumentKind: "WORK_INDENT", commencedOn: "2026-09-01", contract: null };
    expect(whereMatches(leaked, spread)).toBe(true);
    expect(whereMatches(leaked, casePipelineWhere("ON_SITE", hidden) as Record<string, unknown>)).toBe(false);
  });
});
