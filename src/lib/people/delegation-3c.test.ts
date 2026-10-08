import { describe, expect, it } from "vitest";

import { closesLoop, delegationNotes, faultsIn, type Delegation } from "./delegation";
import type { ReportingLine } from "./reporting-lines";

const d = (o: Partial<Delegation> & Pick<Delegation, "id">): Delegation => ({
  fromPersonId: "p1",
  toPersonId: "p2",
  roleCode: "HOD",
  capabilityCodes: [],
  valueCeiling: null,
  reason: "",
  reasonMs: "",
  noSubDelegation: true,
  effectiveFrom: new Date("2026-08-01"),
  effectiveTo: new Date("2026-08-20"),
  ...o,
});

describe("a delegation cannot close a loop (F8)", () => {
  const held = ["run_sourcing"];
  const loopable = (o: Partial<Delegation> & Pick<Delegation, "id">) => d({ noSubDelegation: false, ...o });

  it("refuses A to B while B to A is in force for the same office, even where the office allows onward delegation", () => {
    const existing = [loopable({ id: "ab", fromPersonId: "a", toPersonId: "b" })];
    const faults = faultsIn(loopable({ id: "new", fromPersonId: "b", toPersonId: "a" }), existing, held);
    expect(faults).toContain("DELEGATION_CYCLE");
    expect(faults).not.toContain("SUB_DELEGATION_FORBIDDEN");
  });

  it("refuses a loop through a third person: A to B, B to C, then C to A", () => {
    const existing = [loopable({ id: "ab", fromPersonId: "a", toPersonId: "b" }), loopable({ id: "bc", fromPersonId: "b", toPersonId: "c" })];
    expect(closesLoop(loopable({ id: "new", fromPersonId: "c", toPersonId: "a" }), existing)).toBe(true);
    expect(closesLoop(loopable({ id: "new", fromPersonId: "c", toPersonId: "z" }), existing)).toBe(false);
  });

  it("does not call two officers covering each other for different offices a loop", () => {
    const existing = [loopable({ id: "ab", fromPersonId: "a", toPersonId: "b", roleCode: "HOD" })];
    expect(closesLoop(loopable({ id: "new", fromPersonId: "b", toPersonId: "a", roleCode: "FD" }), existing)).toBe(false);
  });

  it("does not count a delegation that has ended before this one begins", () => {
    const existing = [loopable({ id: "ab", fromPersonId: "a", toPersonId: "b", effectiveFrom: new Date("2026-01-01"), effectiveTo: new Date("2026-02-01") })];
    expect(closesLoop(loopable({ id: "new", fromPersonId: "b", toPersonId: "a" }), existing)).toBe(false);
  });

  it("lets an edit of a delegation pass against itself", () => {
    const existing = [loopable({ id: "ab", fromPersonId: "a", toPersonId: "b" })];
    expect(closesLoop(loopable({ id: "ab", fromPersonId: "a", toPersonId: "b" }), existing)).toBe(false);
  });
});

describe("the line-management rule of FR-APR-011, when reporting lines are recorded", () => {
  const held = ["run_sourcing"];
  const line = (id: string, personId: string, superiorPersonId: string | null, from = "2026-01-01", to: string | null = null): ReportingLine => ({ id, personId, superiorPersonId, effectiveFrom: new Date(from), effectiveTo: to ? new Date(to) : null });
  const proposal = d({ id: "new", fromPersonId: "boss", toPersonId: "clerk", capabilityCodes: ["run_sourcing"] });

  it("applies no rule while no line is recorded, and says Reporting line not set", () => {
    const ctx = { reportingLines: [] as ReportingLine[] };
    expect(faultsIn(proposal, [], held, ctx)).toEqual([]);
    expect(delegationNotes(ctx)).toEqual([expect.objectContaining({ code: "REPORTING_LINES_NOT_SET", en: expect.stringMatching(/^Reporting line not set/) })]);
  });

  it("says nothing where the caller did not look at lines at all", () => {
    expect(delegationNotes({})).toEqual([]);
    expect(faultsIn(proposal, [], held, {})).toEqual([]);
  });

  it("accepts a delegate who reports directly to the grantor", () => {
    expect(faultsIn(proposal, [], held, { reportingLines: [line("1", "clerk", "boss")] })).toEqual([]);
  });

  it("refuses a delegate who reports to someone else, or to nobody", () => {
    expect(faultsIn(proposal, [], held, { reportingLines: [line("1", "clerk", "other")] })).toContain("DELEGATE_NOT_SUBORDINATE");
    expect(faultsIn(proposal, [], held, { reportingLines: [line("1", "clerk", null)] })).toContain("DELEGATE_NOT_SUBORDINATE");
  });

  it("refuses a delegate with no line recorded once lines are recorded for others: they cannot be shown to be a subordinate", () => {
    expect(faultsIn(proposal, [], held, { reportingLines: [line("1", "someone", "boss")] })).toContain("DELEGATE_LINE_NOT_SET");
  });

  it("refuses a delegate whose line changes inside the period to another superior", () => {
    const lines = [line("1", "clerk", "boss", "2026-01-01", "2026-08-10"), line("2", "clerk", "other", "2026-08-10")];
    expect(faultsIn(proposal, [], held, { reportingLines: lines })).toContain("DELEGATE_NOT_SUBORDINATE");
  });

  it("states what it does not check: that the grant is made by the jobholder's superior", () => {
    const notes = delegationNotes({ reportingLines: [line("1", "clerk", "boss")] });
    expect(notes).toEqual([expect.objectContaining({ code: "GRANTOR_SUPERIORITY_NOT_CHECKED" })]);
    expect(notes[0]!.en).toMatch(/not checked/);
  });
});

describe("task-limited delegation (FR-APR-011) as the product defines it today", () => {
  it("is valid without an end date when it names what is handed over, and refused with neither", () => {
    const base = d({ id: "new", effectiveTo: null });
    expect(faultsIn({ ...base, capabilityCodes: ["run_sourcing"] }, [], ["run_sourcing"])).toEqual([]);
    expect(faultsIn({ ...base, capabilityCodes: [] }, [], [])).toContain("UNBOUNDED");
  });
});
