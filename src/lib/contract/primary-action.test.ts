import { describe, expect, it } from "vitest";

import { CASE_STEP_KEYS, defaultCaseStep, earlierOpenSteps, type CaseStep, type CaseStepKey } from "./case-steps";
import { nextLine, primaryAction } from "./primary-action";

const steps = (o: Partial<Record<CaseStepKey, Partial<CaseStep>>>): CaseStep[] =>
  // Phase 2 close-out stage B (flagged, faithful): close-out is no longer parked; it waits, as the others do here.
  CASE_STEP_KEYS.map((key) => ({ key, state: "waiting", next: `${key} next`, action: null, ...o[key] }));

describe("a project opens on its live stage (plan 6.6)", () => {
  // con13: Award left open (return not recorded), Signing and Project past.
  const con13 = steps({ award: { state: "in-progress", action: "RECORD_RETURN" }, "before-signing": { state: "done" }, signing: { state: "done" }, project: { state: "done" } });
  it("a leftover earlier action does not pull a closed or on-site project back", () => {
    expect(defaultCaseStep(con13, { kind: "LIVE", stage: "CLOSED" })).toBe("project");
    expect(defaultCaseStep(con13, { kind: "LIVE", stage: "ON_SITE" })).toBe("project");
    expect(defaultCaseStep(con13, { kind: "LIVE", stage: "COMPLETED" })).toBe("project");
  });
  it("the leftover is a warning on the live stage", () => {
    expect(earlierOpenSteps(con13, { kind: "LIVE", stage: "CLOSED" }, "project").map((s) => s.key)).toEqual(["award"]);
    expect(earlierOpenSteps(con13, { kind: "LIVE", stage: "CLOSED" }, "award")).toEqual([]);
    expect(earlierOpenSteps(con13, { kind: "ENDED", ended: "TERMINATED" }, "project")).toEqual([]);
  });
  it("a signing case lands on signing or before-signing, not on a finished award", () => {
    const s = steps({ award: { state: "in-progress", action: "RECORD_RETURN" }, "before-signing": { state: "in-progress", action: "LODGE_SECURITY" }, signing: { state: "in-progress" } });
    expect(defaultCaseStep(s, { kind: "LIVE", stage: "SIGNING" })).toBe("before-signing");
  });
  it("an award still being made opens on Award; no contract keeps the floor at Award", () => {
    const s = steps({ award: { state: "in-progress", action: "ISSUE" } });
    expect(defaultCaseStep(s, { kind: "LIVE", stage: "AWARDING" })).toBe("award");
    expect(defaultCaseStep(s, { kind: "LIVE", stage: "ON_SITE" })).toBe("award");
  });
});

describe("one primary action per stage", () => {
  it("is the viewed step's own action, or none", () => {
    const s = steps({ award: { action: "ISSUE" }, signing: { action: "RECORD_STAMPING" } });
    expect(primaryAction("award", s)).toBe("ISSUE");
    expect(primaryAction("signing", s)).toBe("RECORD_STAMPING");
    expect(primaryAction("project", s)).toBeNull();
  });
});

describe("the Next line", () => {
  const one = (o: Partial<CaseStep>) => steps({ project: o }).find((s) => s.key === "project")!;
  it("says nothing for a finished step or an on-site project with nothing to do", () => {
    expect(nextLine(one({ state: "done" }))).toBeNull();
    expect(nextLine(one({ state: "in-progress", next: "On site" }))).toBeNull();
  });
  it("says what is waiting otherwise", () => {
    expect(nextLine(one({ state: "in-progress", action: "RECORD_COMMENCEMENT", next: "Record when work commences" }))).toBe("Record when work commences");
    expect(nextLine(steps({ signing: { state: "in-progress", next: "With the legal office" } }).find((s) => s.key === "signing")!)).toBe("With the legal office");
  });
});
