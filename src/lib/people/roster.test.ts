import { describe, expect, it } from "vitest";

import { ROSTER } from "./fixture";
import {
  holdersOf,
  holdingsOn,
  officeReadiness,
  officesHeldBy,
  rosterFaults,
  vacantOffices,
} from "./roster";

const NOW = new Date("2026-06-01");
const names = (people: { name: string }[]) => people.map((p) => p.name).sort();

describe("who holds an office", () => {
  it("resolves an office to the person holding it", () => {
    expect(names(holdersOf(ROSTER, "SINGLE", NOW))).toEqual(["Holder One"]);
  });

  it("ignores an assignment that has already ended", () => {
    expect(names(holdersOf(ROSTER, "SINGLE", NOW))).not.toContain("Holder Two");
  });

  it("resolves the holder as at a past date, not as at today", () => {
    const then = new Date("2019-06-01");
    expect(names(holdersOf(ROSTER, "SINGLE", then))).toEqual(["Holder Two"]);
  });

  it("returns nobody for an office nobody holds", () => {
    expect(holdersOf(ROSTER, "VACANT", NOW)).toEqual([]);
  });

  it("returns every holder where an office is held per department", () => {
    expect(names(holdersOf(ROSTER, "SCOPED", NOW))).toEqual(["Scoped North", "Scoped South"]);
  });
});

describe("what one person holds", () => {
  it("lists the offices held on the date", () => {
    expect(officesHeldBy(ROSTER, "p1", NOW).map((o) => o.code).sort()).toEqual([
      "CONTESTED",
      "SINGLE",
    ]);
  });

  it("leaves out an assignment to an office that does not exist", () => {
    // p2 holds NO_SUCH_OFFICE; it cannot be resolved, so it is not returned as one.
    expect(officesHeldBy(ROSTER, "p2", NOW).map((o) => o.code)).not.toContain("NO_SUCH_OFFICE");
  });
});

describe("holdings", () => {
  it("keeps an assignment whose office is unknown, rather than dropping it silently", () => {
    const unresolved = holdingsOn(ROSTER, NOW).filter((h) => h.office === null);
    expect(unresolved.map((h) => h.assignment.roleCode)).toEqual(["NO_SUCH_OFFICE"]);
  });

  it("drops an assignment whose person is not on the roster at all", () => {
    const roster = { ...ROSTER, people: ROSTER.people.filter((p) => p.id !== "p1") };
    expect(holdingsOn(roster, NOW).some((h) => h.person.id === "p1")).toBe(false);
  });
});

describe("vacancies", () => {
  it("finds the office nobody holds", () => {
    expect(vacantOffices(ROSTER, NOW).map((o) => o.code)).toEqual(["VACANT"]);
  });

  it("marks a vacancy as blocking only where a rule routes to it", () => {
    const withoutRules = rosterFaults(ROSTER, NOW).filter((f) => f.kind === "VACANT");
    expect(withoutRules[0]).toMatchObject({ roleCode: "VACANT", routedTo: false });

    const withRules = rosterFaults(ROSTER, NOW, ["VACANT"]).filter((f) => f.kind === "VACANT");
    expect(withRules[0]).toMatchObject({ roleCode: "VACANT", routedTo: true });
  });
});

describe("faults", () => {
  const faults = rosterFaults(ROSTER, NOW);

  it("reports two people holding one office at one scope", () => {
    const overlap = faults.filter((f) => f.kind === "OVERLAP");
    expect(overlap).toHaveLength(1);
    expect(overlap[0]).toMatchObject({ roleCode: "CONTESTED", scope: null });
    expect([...overlap[0].personNames].sort()).toEqual(["Holder One", "Holder Two"]);
  });

  it("does not treat one office held per department as a clash", () => {
    expect(faults.some((f) => f.kind === "OVERLAP" && f.roleCode === "SCOPED")).toBe(false);
  });

  it("reports an assignment to an office that does not exist", () => {
    expect(faults).toContainEqual({
      kind: "UNKNOWN_OFFICE",
      roleCode: "NO_SUCH_OFFICE",
      personName: "Holder Two",
    });
  });

  it("reports a leaver still holding an office", () => {
    expect(faults).toContainEqual({
      kind: "INACTIVE_HOLDER",
      roleCode: "LEFT",
      personName: "Departed Officer",
    });
  });

  it("repairs nothing — the faults are reported and the roster is unchanged", () => {
    const before = JSON.stringify(ROSTER);
    rosterFaults(ROSTER, NOW, ["VACANT"]);
    expect(JSON.stringify(ROSTER)).toBe(before);
  });
});

describe("whether an office can be asked to sign", () => {
  it("is ready when one active person holds it", () => {
    expect(officeReadiness(ROSTER, "SINGLE", NOW)).toBe("READY");
  });

  it("is vacant when nobody holds it", () => {
    expect(officeReadiness(ROSTER, "VACANT", NOW)).toBe("VACANT");
  });

  it("is vacant, not ready, when its only holder has left", () => {
    // A leaver cannot be asked to sign. Treating the office as ready would route a
    // decision to somebody who is gone.
    expect(officeReadiness(ROSTER, "LEFT", NOW)).toBe("VACANT");
  });

  it("is contested when two people hold it at one scope", () => {
    expect(officeReadiness(ROSTER, "CONTESTED", NOW)).toBe("CONTESTED");
  });

  it("is ready when held once per department", () => {
    expect(officeReadiness(ROSTER, "SCOPED", NOW)).toBe("READY");
  });
});
