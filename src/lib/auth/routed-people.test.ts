import { describe, expect, it } from "vitest";

import type { Holders } from "@/lib/requisition/holders";

import { committeeRosterIds, pendingStep, routePeople, type NamingStep } from "./routed-people";
import { namedAsWords, namedOnEvaluation, namedOnExercise, grantedWords, type ExerciseNamedFacts } from "./sulit-access";

/**
 * Who a route names (product owner, 2026-10-08, ruling on log line 1711; ADR 0034 D14): whoever is able to decide a pending step while it is pending, whoever decided a step,
 * and the roster of the committee a matter is tabled to. All worked out when read.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const step = (sequence: number, over: Partial<NamingStep> = {}): NamingStep => ({ sequence, decision: "PENDING", roleCode: "HOD", actingRoleCode: null, committeeCode: null, nonDelegable: false, decidedByPersonId: null, ...over });
const holders = (holderIds: string[], delegates: { personId: string; ceiling?: string | null }[] = []): Holders => ({
  scope: null,
  holderIds,
  delegates: delegates.map((x) => ({ personId: x.personId, delegation: { valueCeiling: x.ceiling ?? null } as never })),
});
const active = () => true;
const RM = (n: number) => BigInt(n) * 100n;

describe("the people able to decide the step that is pending", () => {
  const by = (office: string) => ({ HOD: holders(["amir"], [{ personId: "dina", ceiling: "50000.00" }]), FD: holders(["fiza"]), ACTING: holders(["ahmad"]) })[office as "HOD"] ?? null;

  it("names the holders of the office acting for the next pending step, and a delegate whose ceiling reaches the value", () => {
    const r = { status: "PENDING", value: RM(10_000), steps: [step(1, { decision: "DONE", decidedByPersonId: "earlier" }), step(2), step(3, { roleCode: "FD" })] };
    expect(routePeople(r, by, active).holderIds.sort()).toEqual(["amir", "dina"]);
  });

  it("does not name the holder of a later step: steps are decided in order, so they cannot decide yet", () => {
    const r = { status: "PENDING", value: RM(10_000), steps: [step(1), step(2, { roleCode: "FD" })] };
    expect(routePeople(r, by, active).holderIds).not.toContain("fiza");
  });

  it("reads the office a step was escalated to, not the office it was resolved to", () => {
    const r = { status: "PENDING", value: RM(1), steps: [step(1, { actingRoleCode: "ACTING" })] };
    expect(routePeople(r, by, active).holderIds).toEqual(["ahmad"]);
  });

  it("names no delegate the decision rule would refuse: capped below the value, or on a step only the holder may decide", () => {
    const capped = { status: "PENDING", value: RM(2_000_000), steps: [step(1)] };
    expect(routePeople(capped, by, active).holderIds).toEqual(["amir"]);
    const alone = { status: "PENDING", value: RM(1), steps: [step(1, { nonDelegable: true })] };
    expect(routePeople(alone, by, active).holderIds).toEqual(["amir"]);
  });

  it("names nobody on a route that is no longer pending, and nobody on a committee's step (decided at its sitting)", () => {
    expect(routePeople({ status: "APPROVED", value: 0n, steps: [step(1, { decision: "DONE" })] }, by, active).holderIds).toEqual([]);
    expect(routePeople({ status: "RECALLED", value: 0n, steps: [step(1)] }, by, active).holderIds).toEqual([]);
    expect(routePeople({ status: "PENDING", value: 0n, steps: [step(1, { committeeCode: "BOARD" })] }, by, active).holderIds).toEqual([]);
  });

  it("leaves out a person recorded as having left", () => {
    const r = { status: "PENDING", value: RM(1), steps: [step(1)] };
    expect(routePeople(r, by, (id) => id !== "amir").holderIds).toEqual(["dina"]);
  });

  it("names nobody when the holders cannot be told (no day, no unit), rather than guessing", () => {
    expect(routePeople({ status: "PENDING", value: 0n, steps: [step(1)] }, () => null, active).holderIds).toEqual([]);
    expect(routePeople({ status: "PENDING", value: 0n, steps: [step(1, { roleCode: null })] }, by, active).holderIds).toEqual([]);
  });

  it("pendingStep is the first undecided step in order", () => {
    expect(pendingStep([step(3), step(1, { decision: "DONE" }), step(2)])?.sequence).toBe(2);
    expect(pendingStep([step(1, { decision: "DONE" })])).toBeNull();
  });
});

describe("whoever decided a step stays named, whatever became of the route", () => {
  it("names the decider of any step, on a route pending, approved or refused, once", () => {
    const steps = [step(1, { decision: "DONE", decidedByPersonId: "a" }), step(2, { decision: "REJECTED", decidedByPersonId: "b" }), step(3, { decision: "DONE", decidedByPersonId: "a" })];
    for (const status of ["PENDING", "APPROVED", "REJECTED", "RECALLED"]) expect(routePeople({ status, value: 0n, steps }, () => null, active).deciderIds.sort()).toEqual(["a", "b"]);
  });
});

describe("the roster of the committee a matter is tabled to, on the sitting's date", () => {
  const seat = (over: Partial<{ personId: string | null; seatRoleCode: string | null; effectiveFrom: Date; effectiveTo: Date | null }>) => ({ personId: null, seatRoleCode: null, effectiveFrom: d("2024-01-01"), effectiveTo: null, ...over });
  const office = (code: string) => (code === "SECRETARIAT" ? ["sec1", "sec2"] : []);

  it("names a seat held by appointment, and everyone who holds the office of a seat held ex officio", () => {
    const ids = committeeRosterIds([seat({ personId: "m1" }), seat({ seatRoleCode: "SECRETARIAT" })], d("2026-10-01"), office);
    expect(ids.sort()).toEqual(["m1", "sec1", "sec2"]);
  });

  it("reads the seats in force on the sitting's date: not one not yet begun, nor one already ended", () => {
    const seats = [seat({ personId: "now" }), seat({ personId: "later", effectiveFrom: d("2027-01-01") }), seat({ personId: "gone", effectiveTo: d("2026-06-30") })];
    expect(committeeRosterIds(seats, d("2026-10-01"), office)).toEqual(["now"]);
    expect(committeeRosterIds(seats, d("2026-05-01"), office).sort()).toEqual(["gone", "now"]);
  });

  it("names nobody for a vacant ex officio seat or a seat with neither", () => {
    expect(committeeRosterIds([seat({ seatRoleCode: "NOBODY" }), seat({})], d("2026-10-01"), office)).toEqual([]);
  });
});

describe("what the routes name opens an exercise, and the evaluation is not widened", () => {
  const f = (over: Partial<ExerciseNamedFacts> = {}): ExerciseNamedFacts => ({ participantIds: [], personInChargeId: null, proposalReviewerId: null, evaluationTeamIds: [], openingPanelIds: [], stepHolderIds: [], stepDeciderIds: [], committeeMemberIds: [], ...over });

  it("names a holder of a pending step, a decider and a committee member on the exercise, each as what they are", () => {
    const facts = f({ stepHolderIds: ["h"], stepDeciderIds: ["d"], committeeMemberIds: ["c"] });
    expect(namedOnExercise(facts, "h")).toEqual(["STEP_HOLDER"]);
    expect(namedOnExercise(facts, "d")).toEqual(["STEP_DECIDER"]);
    expect(namedOnExercise(facts, "c")).toEqual(["COMMITTEE_MEMBER"]);
    expect(namedOnExercise(facts, "z")).toEqual([]);
    expect(namedOnExercise(f({ stepHolderIds: ["x"], stepDeciderIds: ["x"] }), "x")).toEqual(["STEP_HOLDER", "STEP_DECIDER"]);
  });

  it("does not name them on the evaluation: the evaluation scope is unchanged by this ruling", () => {
    const facts = f({ stepHolderIds: ["h"], stepDeciderIds: ["d"], committeeMemberIds: ["c"] });
    for (const p of ["h", "d", "c"]) expect(namedOnEvaluation(facts, p)).toEqual([]);
  });

  it("says why in the product owner's words, with no code", () => {
    expect(namedAsWords("STEP_HOLDER").en).toBe("someone who holds a step on its route");
    expect(namedAsWords("COMMITTEE_MEMBER").en).toBe("a member of the committee it is tabled to");
    expect(grantedWords("NAMED_ON_RECORD", ["STEP_HOLDER", "COMMITTEE_MEMBER"]).en).toBe("Shown because you are someone who holds a step on its route and a member of the committee it is tabled to.");
    for (const n of ["STEP_HOLDER", "STEP_DECIDER", "COMMITTEE_MEMBER"] as const) expect(namedAsWords(n).en).not.toMatch(/[A-Z]_[A-Z]/);
  });
});
