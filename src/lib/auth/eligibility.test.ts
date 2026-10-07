import { describe, expect, it } from "vitest";

import { eligiblePersonIds, type Candidate } from "./eligibility";
import type { StoredGrant } from "./permissions";

/**
 * Who could do an act that needs a permission (Phase 2c): judged as a request is, so the offer of a second person and the refusal cannot disagree.
 */

const today = new Date("2026-10-07T00:00:00Z");
const held = (roleCode: string, scope: string | null = null) => ({ roleCode, scope, effectiveFrom: new Date("2020-01-01"), effectiveTo: null });
const person = (personId: string, o: Partial<Candidate> = {}): Candidate => ({ personId, isAdministrator: false, assignments: [], ...o });
const grants = (...g: [string, string, "GRANTED" | "WITHHELD"][]): StoredGrant[] => g.map(([permissionKey, roleCode, decision]) => ({ permissionKey, roleCode, decision }));

describe("eligible persons", () => {
  it("an administrator holds the administrator keys through the flag, and nobody else does", () => {
    const c = [person("admin", { isAdministrator: true }), person("officer", { assignments: [held("R")] })];
    expect(eligiblePersonIds("accounts.manage", c, grants(["accounts.manage", "R", "GRANTED"]), today)).toEqual(["admin"]);
    expect(eligiblePersonIds("security.policy", c, [], today)).toEqual(["admin"]);
  });

  it("a role the organisation has granted the key to carries it, and one it has withheld or not decided does not", () => {
    const c = [person("a", { assignments: [held("GRANTED_ROLE")] }), person("b", { assignments: [held("WITHHELD_ROLE")] }), person("c", { assignments: [held("OTHER")] })];
    const g = grants(["configuration.issue", "GRANTED_ROLE", "GRANTED"], ["configuration.issue", "WITHHELD_ROLE", "WITHHELD"]);
    expect(eligiblePersonIds("configuration.issue", c, g, today)).toEqual(["a"]);
  });

  it("an administrator never holds a granted-only key, whatever is granted", () => {
    const c = [person("admin", { isAdministrator: true, assignments: [held("R")] })];
    expect(eligiblePersonIds("acts.recordOnBehalf", c, grants(["acts.recordOnBehalf", "R", "GRANTED"]), today)).toEqual([]);
  });

  it("an office that has ended, or is held only for a department, carries nothing; and where today is not known no office is claimed", () => {
    const ended = { roleCode: "R", scope: null, effectiveFrom: new Date("2020-01-01"), effectiveTo: new Date("2025-01-01") };
    const g = grants(["configuration.issue", "R", "GRANTED"]);
    expect(eligiblePersonIds("configuration.issue", [person("ended", { assignments: [ended] })], g, today)).toEqual([]);
    expect(eligiblePersonIds("configuration.issue", [person("dept", { assignments: [held("R", "UNIT")] })], g, today)).toEqual([]);
    expect(eligiblePersonIds("configuration.issue", [person("noday", { assignments: [held("R")] })], g, null)).toEqual([]);
  });

  it("nobody at all gives an empty list, and the screens say a second person is needed", () => {
    expect(eligiblePersonIds("security.policy", [], [], today)).toEqual([]);
  });
});
