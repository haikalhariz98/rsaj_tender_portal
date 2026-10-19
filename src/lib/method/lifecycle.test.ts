import { describe, expect, it } from "vitest";

import type { AwardStatus } from "@/lib/award/types";
import { dayToDate } from "@/lib/dates";
import { WINDOW_PHASES, type WindowPhase } from "@/lib/window/phase";

import { exerciseFlow, flowShape, standingAward, type ExerciseFlowInput, type FlowRoute } from "./lifecycle";
import { EXERCISE_STATUSES, NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN, WINDOW_CHANGE_DOMAIN, type ExerciseStatus, type PackKind } from "./types";

const route = (domain: string, status: FlowRoute["status"], day: string, steps: FlowRoute["steps"] = []): FlowRoute => ({ id: `${domain}-${day}`, domain, status, openedAt: dayToDate(day), steps });
const submitted = route(TENDERING_APPROVAL_DOMAIN, "APPROVED", "2026-09-18", [{ roleLabel: "Head of department", decision: "DONE" }]);

const base = (over: Partial<ExerciseFlowInput> = {}): ExerciseFlowInput => ({
  status: "DRAFT",
  packKind: "QUOTATION",
  path: "ADVERTISED",
  windowPhase: null,
  routes: [],
  awards: [],
  on: {},
  ...over,
});
const view = (steps: ReturnType<typeof exerciseFlow>) => steps.map((s) => `${s.label}:${s.state}`);
const PACK = ["Set up", "Documents", "Approval for tendering", "Advertised", "Opening", "Evaluation", "Award"];
const at = (current: number, labels = PACK) => labels.map((l, i) => `${l}:${i < current ? "done" : i === current ? "current" : "waiting"}`);

describe("worked example: a quotation exercise, advertised and closed, waiting for its opening", () => {
  it("reads left to right as an officer would tell it", () => {
    const steps = exerciseFlow(
      base({
        status: "ADVERTISED",
        windowPhase: "CLOSED",
        routes: [submitted],
        on: { prepared: "12 Sep 2026", approvedForTendering: "21 Sep 2026", published: "24 Sep 2026", closing: "28 Sep 2026, 15:00" },
      }),
    );
    expect(steps).toEqual([
      { key: "SETUP", label: "Set up", sub: "12 Sep 2026", state: "done" },
      { key: "DOCUMENTS", label: "Documents", sub: "Submitted 18 Sep 2026", state: "done" },
      { key: "TENDERING", label: "Approval for tendering", sub: "21 Sep 2026", state: "done" },
      { key: "MARKET", label: "Advertised", sub: "Closed 28 Sep 2026, 15:00", state: "done" },
      { key: "OPENING", label: "Opening", sub: "Awaiting the opening", state: "current" },
      { key: "EVALUATION", label: "Evaluation", sub: undefined, state: "waiting" },
      { key: "AWARD", label: "Award", sub: undefined, state: "waiting" },
    ]);
  });
});

describe("every status on the pack's path", () => {
  const expected: Record<Exclude<ExerciseStatus, "CANCELLED">, number> = {
    DRAFT: 0,
    DOCUMENTS_IN_PREPARATION: 1,
    PENDING_APPROVAL_FOR_TENDERING: 2,
    APPROVED_FOR_TENDERING: 3,
    ADVERTISED: 3,
    INVITED: 3,
    OPENING_IN_PROGRESS: 4,
    OPENED: 5,
    UNDER_EVALUATION: 5,
    EVALUATED: 6,
  };
  for (const [status, current] of Object.entries(expected) as [Exclude<ExerciseStatus, "CANCELLED">, number][]) {
    it(`${status} stands at stage ${current + 1}`, () => {
      const labels = status === "INVITED" ? PACK.map((l) => (l === "Advertised" ? "Invited" : l)) : PACK;
      expect(view(exerciseFlow(base({ status, windowPhase: status === "ADVERTISED" || status === "INVITED" ? "OPEN_FOR_PURCHASE" : null })))).toEqual(at(current, labels));
    });
  }

  it("a draft says nothing beside its current stage it does not know", () => {
    expect(exerciseFlow(base())[0]).toEqual({ key: "SETUP", label: "Set up", sub: undefined, state: "current" });
  });
  it("in preparation, Documents is current", () => {
    expect(exerciseFlow(base({ status: "DOCUMENTS_IN_PREPARATION", on: { prepared: "12 Sep 2026" } })).slice(0, 2)).toEqual([
      { key: "SETUP", label: "Set up", sub: "12 Sep 2026", state: "done" },
      { key: "DOCUMENTS", label: "Documents", sub: undefined, state: "current" },
    ]);
  });
  it("awaiting approval names the office the open route waits on", () => {
    const open = route(TENDERING_APPROVAL_DOMAIN, "PENDING", "2026-09-20", [
      { roleLabel: "Head of department", decision: "DONE" },
      { roleLabel: "Quotation Committee", decision: "PENDING" },
    ]);
    const steps = exerciseFlow(base({ status: "PENDING_APPROVAL_FOR_TENDERING", routes: [open] }));
    expect(steps[1].sub).toBe("Submitted 20 Sep 2026");
    expect(steps[2]).toEqual({ key: "TENDERING", label: "Approval for tendering", sub: "Awaiting Quotation Committee", state: "current" });
  });
  it("awaiting approval with no step loaded says only that it awaits approval", () => {
    expect(exerciseFlow(base({ status: "PENDING_APPROVAL_FOR_TENDERING", routes: [route(TENDERING_APPROVAL_DOMAIN, "PENDING", "2026-09-20", undefined)] }))[2].sub).toBe("Awaiting approval");
  });
  it("approved for tendering, not yet out: the market stage says it is not yet advertised or invited", () => {
    expect(exerciseFlow(base({ status: "APPROVED_FOR_TENDERING" }))[3]).toEqual({ key: "MARKET", label: "Advertised", sub: "Not yet advertised", state: "current" });
    expect(exerciseFlow(base({ status: "APPROVED_FOR_TENDERING", path: "INVITED" }))[3]).toEqual({ key: "MARKET", label: "Invited", sub: "Not yet invited", state: "current" });
    expect(exerciseFlow(base({ status: "APPROVED_FOR_TENDERING", path: null }))[3]).toEqual({ key: "MARKET", label: "In the market", sub: "Not yet published", state: "current" });
  });
  it("opening in progress and evaluation under way say so", () => {
    expect(exerciseFlow(base({ status: "OPENING_IN_PROGRESS", windowPhase: "CLOSED" }))[4].sub).toBe("Under way");
    expect(exerciseFlow(base({ status: "OPENED", windowPhase: "CLOSED" }))[5].sub).toBe("Not started");
    expect(exerciseFlow(base({ status: "UNDER_EVALUATION", windowPhase: "CLOSED", on: { opened: "29 Sep 2026" } })).slice(4, 6)).toEqual([
      { key: "OPENING", label: "Opening", sub: "29 Sep 2026", state: "done" },
      { key: "EVALUATION", label: "Evaluation", sub: "Under way", state: "current" },
    ]);
  });
  it("evaluated with no award: the evaluation done with its report's day, the award not opened yet", () => {
    expect(exerciseFlow(base({ status: "EVALUATED", windowPhase: "CLOSED", on: { reportIssued: "02 Oct 2026" } })).slice(5)).toEqual([
      { key: "EVALUATION", label: "Evaluation", sub: "Report issued 02 Oct 2026", state: "done" },
      { key: "AWARD", label: "Award", sub: "Not opened yet", state: "current" },
    ]);
  });
});

describe("Advertised or Invited: one market stage, named by its path", () => {
  it("only one of the two is ever shown", () => {
    for (const status of EXERCISE_STATUSES) {
      for (const path of ["ADVERTISED", "INVITED", null] as const) {
        const labels = exerciseFlow(base({ status, path, routes: [submitted], on: { prepared: "x", approvedForTendering: "x", published: "x" } })).map((s) => s.label);
        expect(labels.filter((l) => l === "Advertised" || l === "Invited" || l === "In the market").length, `${status} ${path}`).toBeLessThanOrEqual(1);
      }
    }
  });
  it("the status names the path once published, whatever the method now says", () => {
    expect(exerciseFlow(base({ status: "INVITED", path: "ADVERTISED" }))[3].label).toBe("Invited");
    expect(exerciseFlow(base({ status: "ADVERTISED", path: "INVITED" }))[3].label).toBe("Advertised");
  });
});

describe("closed is the window's phase, never the status (ADR 0014)", () => {
  it("advertised and closed: the market stage done, the opening current", () => {
    expect(view(exerciseFlow(base({ status: "ADVERTISED", windowPhase: "CLOSED" })))).toEqual(at(4));
  });
  it("advertised and still open, or the phase not known: the market stage current, never claimed closed", () => {
    for (const phase of ["PUBLISHED", "OPEN_FOR_PURCHASE", "CLOSED_FOR_PURCHASE", "UNKNOWN", null] as const) {
      const steps = exerciseFlow(base({ status: "ADVERTISED", windowPhase: phase, on: { closing: "28 Sep 2026, 15:00" } }));
      expect(view(steps), String(phase)).toEqual(at(3));
      expect(steps[3].sub).toBe("Closes 28 Sep 2026, 15:00");
    }
  });
  it("with no closing on record the market stage has no second line, and closed says only Closed", () => {
    expect(exerciseFlow(base({ status: "ADVERTISED", windowPhase: "OPEN_FOR_PURCHASE" }))[3].sub).toBeUndefined();
    expect(exerciseFlow(base({ status: "ADVERTISED", windowPhase: "CLOSED" }))[3].sub).toBe("Closed");
  });
});

describe("a route returned for amendment puts the documents back in hand, never rejected", () => {
  const returned = route(TENDERING_APPROVAL_DOMAIN, "REJECTED", "2026-09-20", [{ roleLabel: "Head of department", decision: "REJECTED" }]);
  it("Documents is current again, saying it was returned; Approval for tendering not reached", () => {
    const steps = exerciseFlow(base({ status: "DOCUMENTS_IN_PREPARATION", routes: [returned], on: { prepared: "12 Sep 2026" } }));
    expect(view(steps)).toEqual(at(1));
    expect(steps[1].sub).toBe("Returned for amendment");
    expect(steps.some((s) => s.state === "rejected")).toBe(false);
  });
  it("submitted again: the newest route is the one read", () => {
    const again = route(TENDERING_APPROVAL_DOMAIN, "PENDING", "2026-09-25", [{ roleLabel: "Chief Executive", decision: "PENDING" }]);
    const steps = exerciseFlow(base({ status: "PENDING_APPROVAL_FOR_TENDERING", routes: [returned, again] }));
    expect(steps[1].sub).toBe("Submitted 25 Sep 2026");
    expect(steps[2].sub).toBe("Awaiting Chief Executive");
  });
});

describe("name approval is never a stage", () => {
  it("a name route, open or decided, changes nothing in the flow and is never named", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED"] as const) {
      const name = route(NAME_APPROVAL_DOMAIN, status, "2026-09-30", [{ roleLabel: "Chief Executive", decision: status === "APPROVED" ? "DONE" : status === "REJECTED" ? "REJECTED" : "PENDING" }]);
      const window = route(WINDOW_CHANGE_DOMAIN, "PENDING", "2026-09-30", [{ roleLabel: "Board", decision: "PENDING" }]);
      for (const ex of EXERCISE_STATUSES) {
        const without = exerciseFlow(base({ status: ex, routes: [submitted] }));
        const withName = exerciseFlow(base({ status: ex, routes: [submitted, name, window] }));
        expect(withName, `${ex} ${status}`).toEqual(without);
        expect(withName.map((s) => `${s.label} ${s.sub ?? ""}`).join(" ")).not.toMatch(/name/i);
      }
    }
  });
  it("only the exercise's own tendering routes are read: an award's route is not", () => {
    const awards = { ...route(TENDERING_APPROVAL_DOMAIN, "PENDING", "2026-10-01"), awardId: "award1" };
    expect(exerciseFlow(base({ status: "DOCUMENTS_IN_PREPARATION", routes: [awards] }))[1].sub).toBeUndefined();
  });
});

describe("no pack: Set up → Documents → Award (X-9, demo_sx22)", () => {
  const NO_PACK = ["Set up", "Documents", "Award"];
  it("a method with no pack goes from preparation straight to award", () => {
    const steps = exerciseFlow(base({ status: "DOCUMENTS_IN_PREPARATION", packKind: "NONE", on: { prepared: "12 Sep 2026" } }));
    expect(view(steps)).toEqual(at(1, NO_PACK));
    expect(steps[1].sub).toBe("No document pack");
    expect(steps[2].sub).toBeUndefined();
  });
  it("its draft award moves the flow to the award, with the award's reference and state", () => {
    const steps = exerciseFlow(base({ status: "DOCUMENTS_IN_PREPARATION", packKind: "NONE", awards: [{ status: "DRAFT", reference: "DEMO/AWD/0007/2026" }] }));
    expect(view(steps)).toEqual(at(2, NO_PACK));
    expect(steps[2].sub).toBe("DEMO/AWD/0007/2026 · Draft");
  });
  it("its approved award ends the flow", () => {
    expect(view(exerciseFlow(base({ status: "DOCUMENTS_IN_PREPARATION", packKind: "NONE", awards: [{ status: "ISSUED", reference: "A/1" }] })))).toEqual(NO_PACK.map((l) => `${l}:done`));
  });
  it("prepared before document assembly (no pack kind on record) keeps the same path and says why", () => {
    const steps = exerciseFlow(base({ status: "DOCUMENTS_IN_PREPARATION", packKind: null }));
    expect(view(steps)).toEqual(at(1, NO_PACK));
    expect(steps[1].sub).toBe("Prepared before document assembly");
  });
  it("a draft whose method has no pack shows the same short path", () => {
    expect(view(exerciseFlow(base({ status: "DRAFT", packKind: "NONE" })))).toEqual(at(0, NO_PACK));
  });
  it("never shows approval for tendering, the market, the opening or the evaluation", () => {
    for (const status of ["DRAFT", "DOCUMENTS_IN_PREPARATION", "CANCELLED"] as const) {
      const labels = exerciseFlow(base({ status, packKind: "NONE", on: { prepared: "x" } })).map((s) => s.label);
      expect(labels.filter((l) => ["Approval for tendering", "Advertised", "Invited", "In the market", "Opening", "Evaluation"].includes(l))).toEqual([]);
    }
  });
});

describe("a draft whose method does not say which documents it needs", () => {
  it("is not read as no pack: the documents stage says the setting is missing", () => {
    const steps = exerciseFlow(base({ status: "DRAFT", packKind: null }));
    expect(view(steps)).toEqual(at(0, ["Set up", "Documents", "Award"]));
    expect(steps[1]).toEqual({ key: "DOCUMENTS", label: "Documents", sub: "Which documents: not set for the method", state: "waiting" });
  });
  it("the shape: a pack kind or a status only a pack reaches is the pack's; null is not set on a draft, no pack once prepared", () => {
    expect(flowShape("DRAFT", null, false)).toBe("NOT_SET");
    expect(flowShape("DRAFT", "TENDER", false)).toBe("PACK");
    expect(flowShape("DRAFT", "NONE", false)).toBe("NO_PACK");
    expect(flowShape("DOCUMENTS_IN_PREPARATION", null, true)).toBe("NO_PACK");
    expect(flowShape("CANCELLED", null, true)).toBe("NO_PACK");
    expect(flowShape("CANCELLED", null, false)).toBe("NOT_SET");
    expect(flowShape("CANCELLED", "QUOTATION", false)).toBe("PACK");
    expect(flowShape("ADVERTISED", null, true)).toBe("PACK");
    expect(flowShape("EVALUATED", "NONE", true)).toBe("PACK");
  });
});

describe("cancelled: the stages its records prove, then Cancelled", () => {
  it("cancelled after advertising: set up, documents, approval and the market proven, then Cancelled with its day", () => {
    const steps = exerciseFlow(
      base({ status: "CANCELLED", windowPhase: "CANCELLED", routes: [submitted], on: { prepared: "12 Sep 2026", approvedForTendering: "21 Sep 2026", published: "24 Sep 2026", closing: "28 Sep 2026, 15:00", cancelled: "26 Sep 2026" } }),
    );
    expect(steps).toEqual([
      { key: "SETUP", label: "Set up", sub: "12 Sep 2026", state: "done" },
      { key: "DOCUMENTS", label: "Documents", sub: "Submitted 18 Sep 2026", state: "done" },
      { key: "TENDERING", label: "Approval for tendering", sub: "21 Sep 2026", state: "done" },
      { key: "MARKET", label: "Advertised", sub: "24 Sep 2026", state: "done" },
      { key: "CANCELLED", label: "Cancelled", sub: "26 Sep 2026", state: "rejected", stateText: "cancelled" },
    ]);
  });
  it("cancelled as a draft: Cancelled alone, and with no day on record no second line", () => {
    expect(exerciseFlow(base({ status: "CANCELLED", packKind: null }))).toEqual([{ key: "CANCELLED", label: "Cancelled", sub: undefined, state: "rejected", stateText: "cancelled" }]);
  });
  it("cancelled in preparation: set up proven only", () => {
    expect(view(exerciseFlow(base({ status: "CANCELLED", on: { prepared: "x" } })))).toEqual(["Set up:done", "Cancelled:rejected"]);
  });
  it("a later proof proves the stages before it, even where an older row lacks their days", () => {
    expect(view(exerciseFlow(base({ status: "CANCELLED", on: { opened: "29 Sep 2026" } })))).toEqual(["Set up:done", "Documents:done", "Approval for tendering:done", "Advertised:done", "Opening:done", "Cancelled:rejected"]);
  });
  it("cancelled after the evaluation report: everything but the award", () => {
    expect(view(exerciseFlow(base({ status: "CANCELLED", on: { reportIssued: "x" } }))).slice(-2)).toEqual(["Evaluation:done", "Cancelled:rejected"]);
  });
  it("no pack, cancelled in preparation: set up, then Cancelled; a cancelled award proves nothing", () => {
    expect(view(exerciseFlow(base({ status: "CANCELLED", packKind: "NONE", on: { prepared: "x" }, awards: [{ status: "CANCELLED", reference: "A/1" }] })))).toEqual(["Set up:done", "Cancelled:rejected"]);
  });
});

describe("the award stage", () => {
  const evaluated = (awards: ExerciseFlowInput["awards"]) => exerciseFlow(base({ status: "EVALUATED", windowPhase: "CLOSED", awards }));
  it("a draft or one awaiting approval is current", () => {
    for (const status of ["DRAFT", "PENDING_APPROVAL"] as const) {
      expect(evaluated([{ status, reference: "AWD/1" }]).at(-1)?.state).toBe("current");
    }
    expect(evaluated([{ status: "PENDING_APPROVAL", reference: "AWD/1" }]).at(-1)?.sub).toBe("AWD/1 · Awaiting approval");
  });
  it("approved, issued or accepted is done, and so is the whole flow", () => {
    for (const status of ["APPROVED", "ISSUED", "ACCEPTED"] as const) {
      const steps = evaluated([{ status, reference: "AWD/1" }]);
      expect(view(steps)).toEqual(PACK.map((l) => `${l}:done`));
    }
    expect(evaluated([{ status: "ACCEPTED", reference: "AWD/1" }]).at(-1)?.sub).toBe("AWD/1 · Accepted");
  });
  it("a cancelled award is ignored: the award is not opened yet", () => {
    expect(evaluated([{ status: "CANCELLED", reference: "AWD/1" }]).at(-1)).toEqual({ key: "AWARD", label: "Award", sub: "Not opened yet", state: "current" });
  });
  it("a cancelled award beside a new draft: the draft is read", () => {
    expect(evaluated([{ status: "CANCELLED", reference: "AWD/1" }, { status: "DRAFT", reference: "AWD/2" }]).at(-1)?.sub).toBe("AWD/2 · Draft");
  });
  it("a draft award opened before the evaluation is done waits on it, and says it exists", () => {
    const steps = exerciseFlow(base({ status: "OPENED", windowPhase: "CLOSED", awards: [{ status: "DRAFT", reference: "AWD/1" }] }));
    expect(view(steps)).toEqual(at(5));
    expect(steps.at(-1)?.sub).toBe("AWD/1 · Draft");
  });
  it("an award approved under an earlier gate ends the flow without claiming the stages never reached", () => {
    const steps = exerciseFlow(base({ status: "APPROVED_FOR_TENDERING", awards: [{ status: "APPROVED", reference: "AWD/1" }] }));
    expect(view(steps)).toEqual(["Set up:done", "Documents:done", "Approval for tendering:done", "Advertised:waiting", "Opening:waiting", "Evaluation:waiting", "Award:done"]);
  });
  it("the standing award is the furthest along of those not cancelled", () => {
    const a = (status: AwardStatus) => ({ status, reference: status });
    expect(standingAward([a("DRAFT"), a("ISSUED"), a("PENDING_APPROVAL")])?.status).toBe("ISSUED");
    expect(standingAward([a("CANCELLED")])).toBeNull();
    expect(standingAward([])).toBeNull();
  });
});

describe("whatever goes in, the flow reads as one flow (every status × pack × phase × award)", () => {
  const packs: (PackKind | null)[] = ["TENDER", "QUOTATION", "NONE", null];
  const phases: (WindowPhase | null)[] = [...WINDOW_PHASES, null];
  const awardSets: ExerciseFlowInput["awards"][] = [[], ...(["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED", "CANCELLED"] as const).map((status) => [{ status, reference: "AWD/1" }])];
  const routeSets: FlowRoute[][] = [[], [submitted], [route(TENDERING_APPROVAL_DOMAIN, "REJECTED", "2026-09-20")]];
  const onSets: ExerciseFlowInput["on"][] = [{}, { prepared: "a", approvedForTendering: "b", published: "c", closing: "d", opened: "e", reportIssued: "f", cancelled: "g" }];
  const cases: ExerciseFlowInput[] = [];
  for (const status of EXERCISE_STATUSES)
    for (const packKind of packs)
      for (const windowPhase of phases)
        for (const awards of awardSets)
          for (const routes of routeSets)
            for (const on of onSets)
              for (const path of ["ADVERTISED", "INVITED", null] as const) cases.push(base({ status, packKind, windowPhase, awards, routes, on, path }));

  // N4: the sweep takes about 4.5 s alone but 10 to 12 s under a full Windows run; 120_000 is the Linux gate's own testTimeout.
  it("at most one current step, nothing done after it, unique keys, rejected only as a cancelled exercise's last step, no codes", () => {
    for (const c of cases) {
      const steps = exerciseFlow(c);
      const tag = JSON.stringify({ s: c.status, p: c.packKind, w: c.windowPhase, a: c.awards.map((x) => x.status), r: c.routes.map((x) => x.status), on: Object.keys(c.on ?? {}).length, path: c.path });
      const current = steps.flatMap((s, i) => (s.state === "current" ? [i] : []));
      expect(current.length, tag).toBeLessThanOrEqual(1);
      if (current.length === 1) expect(steps.slice(current[0] + 1).some((s) => s.state === "done"), tag).toBe(false);
      expect(new Set(steps.map((s) => s.key)).size, tag).toBe(steps.length);
      const rejected = steps.flatMap((s, i) => (s.state === "rejected" ? [i] : []));
      expect(rejected, tag).toEqual(c.status === "CANCELLED" ? [steps.length - 1] : []);
      for (const s of steps) expect(`${s.label} ${s.sub ?? ""}`, tag).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      expect(steps.length, tag).toBeGreaterThan(0);
    }
  }, 120_000);
  it("a live exercise always has a stage in hand or a finished award", () => {
    for (const c of cases.filter((x) => x.status !== "CANCELLED")) {
      const steps = exerciseFlow(c);
      const finished = steps.at(-1)?.state === "done";
      expect(steps.some((s) => s.state === "current") || finished, c.status).toBe(true);
    }
  });
  it("the same input gives the same steps", () => {
    for (const c of cases.slice(0, 500)) expect(exerciseFlow(c)).toEqual(exerciseFlow(c));
  });
});
