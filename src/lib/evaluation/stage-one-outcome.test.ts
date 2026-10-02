import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stageOneOutcome, stageOneTablingFaults, type StageMatterFacts } from "./stage-one";

/**
 * 6.8 fixes R-1 and R-2 (FR-EVL-005): a two-stage tender's first-stage decision is read across the
 * versions a bidder was carried through, so a new version resets nothing; a decided outcome stands
 * over a later undecided one; same-day matters are ordered by the sitting and the agenda, never left
 * to the read; a deferred matter is tabled again from the Stages section.
 */

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const m = (id: string, outcome: StageMatterFacts["outcome"], tabled: string, over: Partial<StageMatterFacts> = {}): StageMatterFacts => ({ id, outcome, withdrawn: false, tabledAt: day(tabled), sittingDay: day(tabled), sequence: 1, ...over });

describe("the first stage's outcome (R-1, R-2)", () => {
  it("none tabled, or every one withdrawn: not tabled", () => {
    expect(stageOneOutcome([])).toBe("NOT_TABLED");
    expect(stageOneOutcome([m("a", "PENDING", "2026-10-01", { withdrawn: true })])).toBe("NOT_TABLED");
  });
  it("R-1: a matter decided on the row of an earlier version still decides the bidder carried into the next", () => {
    // The caller passes the carried row's matters with the earlier row's (stageMattersAcross).
    const fromVersion1 = [m("v1", "CARRIED", "2026-09-20")];
    const onVersion2: StageMatterFacts[] = [];
    expect(stageOneOutcome([...onVersion2, ...fromVersion1])).toBe("CARRIED");
    expect(stageOneOutcome([m("v1n", "NOT_CARRIED", "2026-09-20")])).toBe("NOT_CARRIED");
  });
  it("R-2: deferred, then tabled again and pending: pending", () => {
    expect(stageOneOutcome([m("a", "DEFERRED", "2026-09-20"), m("b", "PENDING", "2026-09-27")])).toBe("PENDING");
  });
  it("R-2: deferred and not yet tabled again: deferred (the drawer offers to table it again)", () => {
    expect(stageOneOutcome([m("a", "DEFERRED", "2026-09-20")])).toBe("DEFERRED");
    expect(stageOneTablingFaults({ twoStage: true, committeeCode: "TB", sitting: { committeeCode: "TB", frozen: false }, excluded: false, matters: ["DEFERRED"] })).toEqual([]);
  });
  it("R-2: a decided outcome stands over an undecided one, whatever their order", () => {
    expect(stageOneOutcome([m("a", "CARRIED", "2026-09-27"), m("b", "DEFERRED", "2026-09-27", { sequence: 2 })])).toBe("CARRIED");
    expect(stageOneOutcome([m("b", "PENDING", "2026-09-28"), m("a", "NOT_CARRIED", "2026-09-27")])).toBe("NOT_CARRIED");
  });
  it("R-2: two matters tabled the same day are ordered by their sitting's day, then their place on the agenda", () => {
    // Read in the opposite order: the rule orders them, the read does not.
    expect(stageOneOutcome([m("z", "PENDING", "2026-09-27", { sittingDay: day("2026-09-30"), sequence: 1 }), m("y", "DEFERRED", "2026-09-27", { sittingDay: day("2026-09-28"), sequence: 5 })])).toBe("PENDING");
    expect(stageOneOutcome([m("q", "PENDING", "2026-09-27", { sequence: 3 }), m("p", "DEFERRED", "2026-09-27", { sequence: 2 })])).toBe("PENDING");
    expect(stageOneOutcome([m("q", "DEFERRED", "2026-09-27", { sequence: 3 }), m("p", "PENDING", "2026-09-27", { sequence: 2 })])).toBe("DEFERRED");
  });
  it("a first stage decided on an earlier version is not tabled again on the next (the tabling reads across versions)", () => {
    expect(stageOneTablingFaults({ twoStage: true, committeeCode: "TB", sitting: { committeeCode: "TB", frozen: false }, excluded: false, matters: ["CARRIED"] }).map((f) => f.code)).toEqual(["STAGE_ONE_DECIDED"]);
  });
  it("the facts and the tabling act both read across the versions; the Stages list offers the drawer on a deferred matter (source scan)", () => {
    const repo = readFileSync(join(process.cwd(), "src/lib/evaluation/repo.ts"), "utf8");
    expect(repo).toMatch(/r = r\.carriedFromId \? rows\.get\(r\.carriedFromId\) : undefined/);
    expect(repo).toMatch(/factsOf\(current, ex, model, estimate, bidderRowsOf\(evaluations\)\)/);
    const act = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/stage-one-actions.ts"), "utf8");
    expect(act).toMatch(/matters: stageMattersAcross\(row, c\.bidderRows\)/);
    const lists = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/lists.tsx"), "utf8");
    expect(lists).toMatch(/r\.stageOne === "NOT_TABLED" \|\| r\.stageOne === "DEFERRED"/);
  });
});
