import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { tenderingStepperSteps, type TenderingRouteForSteps } from "./route-flow";

type Step = TenderingRouteForSteps["steps"][number];
const step = (id: string, label: string, decision: Step["decision"], extra: Partial<Step> = {}): Step => ({
  id,
  roleLabel: label,
  decision,
  committeeCode: null,
  decidedByName: decision === "PENDING" ? null : "A. Rahman",
  decidedOn: decision === "PENDING" ? null : dayToDate("2026-09-21"),
  ...extra,
});
const route = (status: TenderingRouteForSteps["status"], steps: Step[], warnings: unknown = []): TenderingRouteForSteps => ({ status, warnings, openedAt: dayToDate("2026-09-20"), steps });
const states = (r: ReturnType<typeof tenderingStepperSteps>) => r.map((s) => `${s.label}:${s.state}`);

describe("the Approval for Tendering route as a flow of steps (founder, 2026-10-05)", () => {
  it("worked example: submitted 20 Sep, the head of department decided on 21 Sep, the committee waiting now", () => {
    const r = tenderingStepperSteps(route("PENDING", [step("s1", "Head of department", "DONE"), step("s2", "Quotation Committee", "PENDING", { committeeCode: "QC" })]));
    expect(r).toEqual([
      { key: "submitted", label: "Submitted", sub: "20 Sep 2026", state: "done" },
      { key: "s1", label: "Head of department", sub: "A. Rahman · 21 Sep 2026", state: "done" },
      { key: "s2", label: "Quotation Committee", sub: "Awaiting the committee", state: "current" },
      { key: "outcome", label: "Approved for tendering", state: "waiting" },
    ]);
  });

  it("an office step waiting reads as awaiting a decision; the ones after it are not reached", () => {
    const r = tenderingStepperSteps(route("PENDING", [step("s1", "Head of department", "PENDING"), step("s2", "Chief Executive", "PENDING")]));
    expect(states(r)).toEqual(["Submitted:done", "Head of department:current", "Chief Executive:waiting", "Approved for tendering:waiting"]);
    expect(r[1].sub).toBe("Awaiting decision");
  });

  it("an approved route ends approved for tendering", () => {
    expect(states(tenderingStepperSteps(route("APPROVED", [step("s1", "Head of department", "DONE")])))).toEqual(["Submitted:done", "Head of department:done", "Approved for tendering:done"]);
  });

  it("a rejected route ends returned for amendment, never rejected or refused (Q-3, §7.3.2)", () => {
    const r = tenderingStepperSteps(route("REJECTED", [step("s1", "Head of department", "REJECTED"), step("s2", "Chief Executive", "PENDING")]));
    expect(states(r)).toEqual(["Submitted:done", "Head of department:rejected", "Chief Executive:waiting", "Returned for amendment:rejected"]);
    expect(r[1].sub).toBe("A. Rahman · 21 Sep 2026");
    for (const s of r) expect(`${s.label} ${s.sub ?? ""}`).not.toMatch(/reject|refus/i);
  });

  it("a route withdrawn when the exercise was cancelled says so", () => {
    const r = tenderingStepperSteps(route("RECALLED", [step("s1", "Head of department", "PENDING")], [{ code: "WITHDRAWN_ON_CANCEL" }]));
    expect(states(r)).toEqual(["Submitted:done", "Head of department:waiting", "Withdrawn: exercise cancelled:rejected"]);
  });

  it("a decided step with no name or day on record still shows, with no second line", () => {
    const r = tenderingStepperSteps(route("APPROVED", [step("s1", "Head of department", "DONE", { decidedByName: null, decidedOn: null })]));
    expect(r[1]).toEqual({ key: "s1", label: "Head of department", sub: undefined, state: "done" });
  });

  it("the submitted day is the stored day itself, in any zone (opened-day item 10)", () => {
    const r = tenderingStepperSteps({ ...route("PENDING", []), openedAt: dayToDate("2026-10-02") });
    expect(r[0].sub).toBe("02 Oct 2026");
  });
});
