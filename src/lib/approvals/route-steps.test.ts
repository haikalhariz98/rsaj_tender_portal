import { describe, expect, it } from "vitest";

import { routeSteps, type RouteStepIn } from "./route-steps";

const step = (id: string, decision: RouteStepIn["decision"], committee = false): RouteStepIn => ({
  id,
  label: id.toUpperCase(),
  decision,
  committee,
  decidedBy: decision === "PENDING" ? null : "A. Officer",
  decidedOn: decision === "PENDING" ? null : "05 Oct 2026",
});
const states = (r: ReturnType<typeof routeSteps>) => r.map((s) => `${s.label}:${s.state}`);

describe("an approval route as a flow of steps (founder, 2026-10-05)", () => {
  it("an open route: submitted, the decided steps done, the first undecided waiting now, the rest not reached", () => {
    const r = routeSteps({ status: "PENDING", openedOn: "01 Oct 2026", steps: [step("ceo", "DONE"), step("board", "PENDING", true), step("chair", "PENDING")] });
    expect(states(r)).toEqual(["Submitted:done", "CEO:done", "BOARD:current", "CHAIR:waiting", "Approved:waiting"]);
    expect(r[1].sub).toBe("A. Officer · 05 Oct 2026");
    expect(r[2].sub).toBe("Awaiting the committee");
  });
  it("after an escalation the step names the office now holding it (UX finding 5)", () => {
    const r = routeSteps({ status: "PENDING", openedOn: "x", steps: [{ ...step("hod", "PENDING"), actingLabel: "Finance Director" }] });
    expect(r[1]).toMatchObject({ label: "Finance Director", state: "current", sub: "Escalated from HOD" });
  });
  it("an approved route ends approved", () => {
    expect(states(routeSteps({ status: "APPROVED", openedOn: "x", steps: [step("hod", "DONE")] }))).toEqual(["Submitted:done", "HOD:done", "Approved:done"]);
  });
  it("a rejected route shows the step that rejected it and ends rejected", () => {
    expect(states(routeSteps({ status: "REJECTED", openedOn: "x", steps: [step("hod", "DONE"), step("ceo", "REJECTED"), step("board", "PENDING")] }))).toEqual([
      "Submitted:done",
      "HOD:done",
      "CEO:rejected",
      "BOARD:waiting",
      "Rejected:rejected",
    ]);
  });
  it("a recalled route waits on nothing: its undecided steps are not reached", () => {
    expect(states(routeSteps({ status: "RECALLED", openedOn: "x", steps: [step("hod", "PENDING")] }))).toEqual(["Submitted:done", "HOD:waiting", "Recalled:rejected"]);
  });
  it("an outcome label words the last step only, in the same state, for every status", () => {
    const words = (st: string) => `outcome of ${st}`;
    for (const status of ["PENDING", "APPROVED", "REJECTED", "RECALLED"] as const) {
      const route = { status, openedOn: "01 Oct 2026", steps: [step("hod", status === "APPROVED" ? "DONE" : status === "REJECTED" ? "REJECTED" : "PENDING")] };
      const plain = routeSteps(route);
      const worded = routeSteps(route, words);
      // Only the hidden state word and the tone differ (below): the step, its label and its state are the same.
      const bare = (s: (typeof worded)[number]) => ({ ...s, stateText: undefined, tone: undefined });
      expect(worded.slice(0, -1).map(bare)).toEqual(plain.slice(0, -1).map(bare));
      expect(bare(worded.at(-1)!)).toEqual({ ...plain.at(-1), label: `outcome of ${status}`, stateText: undefined, tone: undefined });
    }
  });
  it("where the route words its outcome, a refusal is a return: amber, and never read aloud as rejected (founder, 2026-10-05; Q-3)", () => {
    const r = routeSteps({ status: "REJECTED", openedOn: "x", steps: [step("hod", "REJECTED"), step("ceo", "PENDING")] }, () => "Returned for amendment");
    expect(r.filter((s) => s.state === "rejected").map((s) => [s.label, s.stateText, s.tone])).toEqual([
      ["HOD", "sent the documents back", "warn"],
      ["Returned for amendment", "not approved", "warn"],
    ]);
    const recalled = routeSteps({ status: "RECALLED", openedOn: "x", steps: [step("hod", "PENDING")] }, () => "Withdrawn");
    expect(recalled.at(-1)).toMatchObject({ state: "rejected", stateText: "withdrawn", tone: "warn" });
    for (const s of [...r, ...recalled]) expect(s.stateText ?? "").not.toMatch(/reject/i);
  });
  it("without an outcome label the words are as they always were", () => {
    expect(routeSteps({ status: "REJECTED", openedOn: "x", steps: [step("hod", "REJECTED")] }).at(-1)).toEqual({ key: "outcome", label: "Rejected", state: "rejected" });
    expect(routeSteps({ status: "PENDING", openedOn: "x", steps: [step("hod", "PENDING")] }).at(-1)).toEqual({ key: "outcome", label: "Approved", state: "waiting" });
  });
});
