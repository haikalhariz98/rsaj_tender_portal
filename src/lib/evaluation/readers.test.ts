import { describe, expect, it } from "vitest";

import type { RoleHolding } from "@/lib/scope/estimate";

import { evaluationOfficeHeld, evaluationReaderCodes } from "./readers";

/**
 * The Secretariat and Internal Audit as readers of an evaluation (product owner, 2026-10-08, decisions log line 1735).
 */

const held = (personId: string, roleCode: string, scope: string | null = null, from = "2020-01-01", to: string | null = null): RoleHolding => ({ personId, roleCode, scope, from, to });
const PATH = ["DEPT_A", "DIV", "ORG"];
const offices = { secretariatRoleCode: "SEC", internalAuditRoleCode: "IA" };

describe("who reads an evaluation as the Secretariat or Internal Audit", () => {
  it("is a holder of the office on the day, told by which office", () => {
    const h = [held("s", "SEC"), held("a", "IA")];
    expect(evaluationOfficeHeld(offices, h, "s", "2026-10-08", PATH)).toBe("SECRETARIAT_OFFICE");
    expect(evaluationOfficeHeld(offices, h, "a", "2026-10-08", PATH)).toBe("INTERNAL_AUDIT_OFFICE");
    expect(evaluationOfficeHeld(offices, h, "nobody", "2026-10-08", PATH)).toBeNull();
  });

  it("an office unset grants nothing, even to the holder of the office it would have named", () => {
    const h = [held("s", "SEC"), held("a", "IA")];
    expect(evaluationOfficeHeld({ secretariatRoleCode: null, internalAuditRoleCode: "IA" }, h, "s", "2026-10-08", PATH)).toBeNull();
    expect(evaluationOfficeHeld({ secretariatRoleCode: "SEC", internalAuditRoleCode: null }, h, "a", "2026-10-08", PATH)).toBeNull();
    expect(evaluationOfficeHeld({ secretariatRoleCode: null, internalAuditRoleCode: null }, h, "s", "2026-10-08", PATH)).toBeNull();
  });

  it("is judged on the day of reading: not before the holding began, nor after it ended", () => {
    const h = [held("s", "SEC", null, "2026-10-01", "2026-10-31")];
    expect(evaluationOfficeHeld(offices, h, "s", "2026-09-30", PATH)).toBeNull();
    expect(evaluationOfficeHeld(offices, h, "s", "2026-10-15", PATH)).toBe("SECRETARIAT_OFFICE");
    expect(evaluationOfficeHeld(offices, h, "s", "2026-11-01", PATH)).toBeNull();
  });

  it("an office held for a department counts for that department's exercises only, and the nearest unit with a holder wins (as in the custody rule)", () => {
    const h = [held("a1", "SEC", "DEPT_A"), held("b1", "SEC", "DEPT_B"), held("org", "SEC", null)];
    expect(evaluationOfficeHeld(offices, h, "a1", "2026-10-08", PATH)).toBe("SECRETARIAT_OFFICE");
    expect(evaluationOfficeHeld(offices, h, "b1", "2026-10-08", PATH)).toBeNull();
    // The organisation-wide holder is not an overseer of a department that has its own holder.
    expect(evaluationOfficeHeld(offices, h, "org", "2026-10-08", PATH)).toBeNull();
    // For a department with no holder of its own, the organisation-wide holder reads.
    expect(evaluationOfficeHeld(offices, h, "org", "2026-10-08", ["DEPT_C", "DIV", "ORG"])).toBe("SECRETARIAT_OFFICE");
  });

  it("names the codes the setting holds, and none that are unset", () => {
    expect(evaluationReaderCodes(offices)).toEqual(["SEC", "IA"]);
    expect(evaluationReaderCodes({ secretariatRoleCode: null, internalAuditRoleCode: "IA" })).toEqual(["IA"]);
    expect(evaluationReaderCodes({ secretariatRoleCode: null, internalAuditRoleCode: null })).toEqual([]);
  });
});
