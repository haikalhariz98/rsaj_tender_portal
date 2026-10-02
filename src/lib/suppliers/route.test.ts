import { describe, expect, it } from "vitest";

import type { Matrix } from "@/lib/authority/types";

import { SUPPLIER_MATRIX } from "./fixture";
import { supplierRoute, type SupplierRequester } from "./route";

const WHAT = { en: "a supplier's registration", ms: "pendaftaran pembekal" };
const someone: SupplierRequester = { id: "p_clerk", holds: () => false, ableToAct: () => ({ holderIds: ["p_officer", "p_other"], delegateIds: [] }) };

describe("a supplier matter's route (OD-2 A: routing value null)", () => {
  it("an unbounded rule routes it: the officer recommends, the manager approves", () => {
    const r = supplierRoute(SUPPLIER_MATRIX, "supplier_registration", "NEW", someone, WHAT);
    expect(r.state).toBe("RESOLVED");
    expect(r.ruleKey).toBe("reg.any");
    expect(r.chain.map((s) => [s.roleCode, s.act])).toEqual([
      ["OFFICER", "R"],
      ["MANAGER", "A"],
    ]);
    expect(r.refusal).toBeNull();
  });

  it("a rule with a value band never matches: a null value is not an invented 0", () => {
    // The RENEWAL row is banded, so it does not match; and as a conditional sibling it suppresses the general row.
    const r = supplierRoute(SUPPLIER_MATRIX, "supplier_registration", "RENEWAL", someone, WHAT);
    expect(r.state).toBe("NO_RULE");
    expect(r.refusal?.en).toMatch(/Configuration › Approval matrix, with no value band/);
  });

  it("no rule for the domain (rows ship empty) refuses, naming the Approval matrix", () => {
    const r = supplierRoute({ ...SUPPLIER_MATRIX, rules: [] }, "supplier_registration", "NEW", someone, WHAT);
    expect(r).toMatchObject({ state: "NO_RULE", chain: [] });
    expect(r.refusal?.en).toBe("No approval rule in the matrix in force covers a supplier's registration. Record a rule for it under Configuration › Approval matrix, with no value band (supplier matters are not routed on a value), then send it again.");
    expect(r.refusal?.ms).toMatch(/Matriks kelulusan/);
  });

  it("a committee step is refused: no sitting tables a supplier matter", () => {
    const r = supplierRoute(SUPPLIER_MATRIX, "supplier_registration", "UPGRADE", someone, WHAT);
    expect(r.state).toBe("HAS_COMMITTEE_STEP");
  });

  it("the sender holding the approving office escalates by self-approval", () => {
    const holder: SupplierRequester = { id: "p_mgr", holds: (c) => c === "MANAGER", ableToAct: () => ({ holderIds: ["p_officer", "p_dir"], delegateIds: [] }) };
    const r = supplierRoute(SUPPLIER_MATRIX, "supplier_registration", "NEW", holder, WHAT);
    expect(r.state).toBe("RESOLVED");
    expect(r.approverCode).toBe("DIRECTOR");
  });

  it("with nowhere to escalate, refused naming the setting", () => {
    const m: Matrix = { ...SUPPLIER_MATRIX, roles: { ...SUPPLIER_MATRIX.roles, MANAGER: { ...SUPPLIER_MATRIX.roles.MANAGER, selfApprovalEscalatesToCode: null } } };
    const holder: SupplierRequester = { id: "p_mgr", holds: (c) => c === "MANAGER", ableToAct: () => ({ holderIds: ["p_officer"], delegateIds: [] }) };
    const r = supplierRoute(m, "supplier_registration", "NEW", holder, WHAT);
    expect(r.state).toBe("SELF_APPROVAL_NOWHERE");
    expect(r.refusal?.en).toMatch(/Users & roles/);
  });

  it("a step only the sender could act for is refused, naming the way out", () => {
    const only: SupplierRequester = { id: "p_off", holds: () => false, ableToAct: (c) => (c === "OFFICER" ? { holderIds: ["p_off"], delegateIds: [] } : { holderIds: ["p_mgr"], delegateIds: [] }) };
    const r = supplierRoute(SUPPLIER_MATRIX, "supplier_registration", "NEW", only, WHAT);
    expect(r.state).toBe("REQUESTER_ONLY");
    expect(r.refusal?.en).toMatch(/Registration officer/);
  });
});
