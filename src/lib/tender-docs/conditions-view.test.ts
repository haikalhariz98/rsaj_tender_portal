import { describe, expect, it } from "vitest";

import { assuranceCardShown, CLAUSE_STATUS as S, clausesSummary, triOf } from "./conditions-view";

describe("the assurance card follows the policy, and an unanswered policy is not 'no'", () => {
  it("is hidden only where the organisation decided it is not required", () => {
    expect(assuranceCardShown(triOf(true))).toBe(true);
    expect(assuranceCardShown(triOf(false))).toBe(false);
    expect(assuranceCardShown(triOf(null))).toBe(true);
    expect(assuranceCardShown(triOf(undefined))).toBe(true);
  });
});

describe("the mandatory clauses as one line", () => {
  const line = (statuses: string[], none: string | null = null) => clausesSummary({ none, statuses });
  it("reads 'N clauses carried' and stays closed when every clause is carried", () => {
    expect(line([S.carried, S.carried])).toEqual({ text: "2 clauses carried", tone: "ok", expand: false, empty: false });
    expect(line([S.carried]).text).toBe("1 clause carried");
  });
  it("opens when a clause is missing, and says how many", () => {
    expect(line([S.carried, S.missing])).toEqual({ text: "1 clause carried, 1 missing", tone: "warn", expand: true, empty: false });
  });
  it("a clause whose mandatory-ness is not set is a gap to put right, not a carried clause", () => {
    const l = line([S.carried, S.notSet]);
    expect(l.expand).toBe(true);
    expect(l.tone).toBe("warn");
    expect(l.text).toMatch(/mandatory status is not set/);
  });
  it("an endorsed omission is named in the line and keeps its Remove reachable", () => {
    const l = line([S.carried, S.endorsed]);
    expect(l.text).toBe("1 clause carried, 1 left out under an endorsement");
    expect(l.expand).toBe(true);
    expect(l.tone).toBe("neutral");
  });
  it("clauses not yet checked are never called carried", () => {
    const l = line([S.notChecked, S.notChecked]);
    expect(l.text).toBe("2 clauses checked once the documents are started");
    expect(l.text).not.toMatch(/carried/);
    expect(l.expand).toBe(false);
  });
  it("no clause configured says what is missing, not '0 carried'", () => {
    const l = line([], "No clauses are configured.");
    expect(l).toEqual({ text: "No clauses are configured.", tone: "warn", expand: false, empty: true });
    expect(line([]).text).not.toMatch(/0/);
  });
  it("a frozen pack that needed no clause states it as a fact, not a gap", () => {
    expect(clausesSummary({ none: "No clause was required when the documents were frozen.", noneTone: "neutral", statuses: [] })).toMatchObject({ tone: "neutral", empty: true, expand: false });
  });
  it("clauses that are not required in every agreement are not counted as carried", () => {
    expect(line([S.notRequired, S.carried]).text).toBe("1 clause carried");
    expect(line([S.notRequired]).text).toMatch(/No clause is required in every agreement/);
  });
});
