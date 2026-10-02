import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { bidder, facts, result, submission } from "./fixture";
import { stageOf } from "./model";
import { inputsAccess, inputStageFaults } from "./stages";
import { FIVE_PHASE } from "./ta109-fixture";

/**
 * 6.8 review S-2: the bidders list's "Record inputs" is offered only where `recordInputs` would take
 * them: some stage reading the inputs is not submitted and has the bid in the running. The screen and
 * the act judge with the same rule.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const shortlisted = (over: Parameters<typeof facts>[0] = {}) =>
  facts(
    {
      bidders: [bidder(1, { shortlisted: true }), bidder(2, { shortlisted: true }), bidder(3, { excludedReason: "Above the ceiling." })],
      submissions: [submission("FASA1", "CONTRACT_PROCUREMENT"), submission("FASA2", "CONTRACT_PROCUREMENT")],
      results: [result("b1", "FASA1"), result("b2", "FASA1"), result("b1", "FASA2"), result("b2", "FASA2")],
      ...over,
    },
    FIVE_PHASE,
  );

describe("whether a bid takes inputs now (S-2)", () => {
  it("a bid in the running at an open reading stage: offered", () => {
    const f = shortlisted();
    expect(inputsAccess(f, f.bidders[0])).toEqual([]);
  });
  it("an excluded bid takes none, at every stage that reads them", () => {
    const f = shortlisted();
    expect([...new Set(codes(inputsAccess(f, f.bidders[2])))]).toEqual(["EXCLUDED_ABOVE_CEILING"]);
  });
  it("a bid out of the running before the reading stages takes none", () => {
    const f = shortlisted({ bidders: [bidder(1, { shortlisted: true }), bidder(2, { shortlisted: false })], results: [result("b1", "FASA1"), result("b2", "FASA1"), result("b1", "FASA2"), result("b2", "FASA2", { outOfRunning: true, passed: false })] });
    expect([...new Set(codes(inputsAccess(f, f.bidders[1])))]).toEqual(["NOT_IN_RUNNING"]);
  });
  it("one reading stage submitted, another still open: still offered (the open one takes its input)", () => {
    const f = shortlisted({ submissions: [submission("FASA1", "CONTRACT_PROCUREMENT"), submission("FASA2", "CONTRACT_PROCUREMENT"), submission("FASA3", "CONTRACT_PROCUREMENT")] });
    expect(codes(inputStageFaults(f, stageOf(f.model, "FASA3")!, f.bidders[0]))).toEqual(["INPUTS_FROZEN"]);
    expect(inputsAccess(f, f.bidders[0])).toEqual([]);
  });
  it("every reading stage submitted: not offered, the inputs stand", () => {
    const f = shortlisted({ submissions: ["FASA1", "FASA2", "FASA3", "FASA4"].map((s) => submission(s, "CONTRACT_PROCUREMENT")) });
    expect([...new Set(codes(inputsAccess(f, f.bidders[0])))]).toEqual(["INPUTS_FROZEN"]);
  });
  it("the act and the screen share the rule (source scan)", () => {
    const action = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/actions.ts"), "utf8");
    const body = action.slice(action.indexOf("export async function recordInputs"), action.indexOf("export async function correctPrice"));
    expect(body).toMatch(/inputStageFaults\(f, s, b\)/);
    const read = readFileSync(join(process.cwd(), "src/lib/evaluation/read.ts"), "utf8");
    expect(read).toMatch(/inputsAccess\(f, b\)/);
    const lists = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/lists.tsx"), "utf8");
    expect(lists).toMatch(/b\.inputs\.allowed && <InputsDrawer/);
    expect(lists).toMatch(/an excluded bid takes no inputs/);
  });
});
