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

  // Changed for the product owner's ruling of 2026-10-08 on log line 1773. This test used to say that the grant being made by the jobholder's superior is NOT checked, because a
  // delegation had no jobholder to compare with. It records one now, so with lines recorded the note says both rules are checked (the superior of the jobholder, the subordinate of the
  // jobholder), and the rules themselves are proved below.
  it("says, once lines are recorded, that the grantor and the delegate are both checked against the jobholder's line", () => {
    const notes = delegationNotes({ reportingLines: [line("1", "clerk", "boss")] });
    expect(notes).toEqual([expect.objectContaining({ code: "RULES_CHECKED" })]);
    expect(notes[0]!.en).toMatch(/jobholder's immediate superior/);
    expect(notes[0]!.en).toMatch(/direct line subordinate of the jobholder/);
  });
});

describe("a delegation records the jobholder whose authority is delegated, apart from the grantor (FR-APR-011, ruling of 2026-10-08 on log line 1773)", () => {
  const held = ["run_sourcing"];
  const line = (id: string, personId: string, superiorPersonId: string | null, from = "2026-01-01", to: string | null = null): ReportingLine => ({ id, personId, superiorPersonId, effectiveFrom: new Date(from), effectiveTo: to ? new Date(to) : null });
  /// The grantor is the superior "boss", the jobholder "head" holds the office, the delegate "clerk" reports to the jobholder.
  const proposal = d({ id: "new", fromPersonId: "boss", jobholderPersonId: "head", toPersonId: "clerk", capabilityCodes: ["run_sourcing"] });
  const lines = [line("1", "head", "boss"), line("2", "clerk", "head")];

  it("refuses a delegation of one's own authority, with no line recorded and with lines recorded", () => {
    const own = d({ id: "new", fromPersonId: "head", jobholderPersonId: "head", toPersonId: "clerk", capabilityCodes: ["run_sourcing"] });
    expect(faultsIn(own, [], held, {})).toContain("GRANTOR_IS_JOBHOLDER");
    expect(faultsIn(own, [], held, { reportingLines: [] })).toContain("GRANTOR_IS_JOBHOLDER");
    expect(faultsIn(own, [], held, { reportingLines: lines })).toContain("GRANTOR_IS_JOBHOLDER");
  });

  it("refuses the jobholder as the delegate: they would receive their own authority", () => {
    expect(faultsIn({ ...proposal, toPersonId: "head" }, [], held, {})).toContain("DELEGATE_IS_JOBHOLDER");
  });

  it("asks the JOBHOLDER to hold the office, and not the grantor, who being the superior need hold none", () => {
    expect(faultsIn(proposal, [], held, { grantorHoldsOffice: false, jobholderHoldsOffice: true })).toEqual([]);
    expect(faultsIn(proposal, [], held, { grantorHoldsOffice: true, jobholderHoldsOffice: false })).toEqual(["JOBHOLDER_DOES_NOT_HOLD"]);
  });

  it("a delegation recorded before the rule is still judged on the grantor, as it always was", () => {
    const legacy = d({ id: "old", fromPersonId: "holder", toPersonId: "clerk", capabilityCodes: ["run_sourcing"] });
    expect(faultsIn(legacy, [], held, { grantorHoldsOffice: false })).toEqual(["GRANTOR_DOES_NOT_HOLD"]);
    expect(faultsIn(legacy, [], held, { grantorHoldsOffice: true })).toEqual([]);
    expect(faultsIn(legacy, [], held, { reportingLines: [line("1", "clerk", "holder")] })).toEqual([]);
    expect(faultsIn(legacy, [], held, { reportingLines: [line("1", "clerk", "other")] })).toContain("DELEGATE_NOT_SUBORDINATE");
  });

  it("applies no line rule while none is recorded, but still the two that need none", () => {
    expect(faultsIn(proposal, [], held, { reportingLines: [], jobholderHoldsOffice: true })).toEqual([]);
    expect(delegationNotes({ reportingLines: [] })[0]!.en).toMatch(/not checked/);
    expect(delegationNotes({ reportingLines: [] })[0]!.en).toMatch(/grantor is never the jobholder/);
  });

  it("with lines recorded, accepts the jobholder's immediate superior as grantor and a direct subordinate of the jobholder as delegate", () => {
    expect(faultsIn(proposal, [], held, { reportingLines: lines })).toEqual([]);
  });

  it("refuses a grantor who is not the jobholder's immediate superior, and one the jobholder has no line for", () => {
    expect(faultsIn({ ...proposal, fromPersonId: "stranger" }, [], held, { reportingLines: lines })).toContain("GRANTOR_NOT_SUPERIOR");
    expect(faultsIn(proposal, [], held, { reportingLines: [line("2", "clerk", "head")] })).toContain("JOBHOLDER_LINE_NOT_SET");
    expect(faultsIn(proposal, [], held, { reportingLines: [line("1", "head", null), line("2", "clerk", "head")] })).toContain("GRANTOR_NOT_SUPERIOR");
  });

  it("refuses a delegate who reports to the GRANTOR but not to the jobholder: the subordinate is the jobholder's", () => {
    const f = faultsIn(proposal, [], held, { reportingLines: [line("1", "head", "boss"), line("2", "clerk", "boss")] });
    expect(f).toContain("DELEGATE_NOT_SUBORDINATE");
    expect(f).not.toContain("GRANTOR_NOT_SUPERIOR");
  });

  it("checks both lines on every day a line changes inside the period, the jobholder's too", () => {
    const changing = [line("1", "head", "boss", "2026-01-01", "2026-08-10"), line("2", "head", "other", "2026-08-10"), line("3", "clerk", "head")];
    expect(faultsIn(proposal, [], held, { reportingLines: changing })).toContain("GRANTOR_NOT_SUPERIOR");
    const delegateMoves = [line("1", "head", "boss"), line("2", "clerk", "head", "2026-01-01", "2026-08-10"), line("3", "clerk", "other", "2026-08-10")];
    expect(faultsIn(proposal, [], held, { reportingLines: delegateMoves })).toContain("DELEGATE_NOT_SUBORDINATE");
  });

  it("judges one delegate at a time, and a loop, on the jobholder's authority", () => {
    const first = d({ id: "first", fromPersonId: "boss", jobholderPersonId: "head", toPersonId: "clerk", capabilityCodes: ["run_sourcing"] });
    // Another grantor over the same jobholder's authority in the same period is the same office twice.
    expect(faultsIn({ ...proposal, id: "second", fromPersonId: "boss2", toPersonId: "clerk2" }, [first], held, {})).toContain("OVERLAPS_EXISTING");
    // The delegate's authority passed back to the jobholder would close a loop.
    expect(closesLoop(d({ id: "back", fromPersonId: "boss", jobholderPersonId: "clerk", toPersonId: "head", capabilityCodes: [], noSubDelegation: false }), [{ ...first, noSubDelegation: false }])).toBe(true);
  });
});

describe("task-limited delegation (FR-APR-011) as the product defines it today", () => {
  it("is valid without an end date when it names what is handed over, and refused with neither", () => {
    const base = d({ id: "new", effectiveTo: null });
    expect(faultsIn({ ...base, capabilityCodes: ["run_sourcing"] }, [], ["run_sourcing"])).toEqual([]);
    expect(faultsIn({ ...base, capabilityCodes: [] }, [], [])).toContain("UNBOUNDED");
  });
});
