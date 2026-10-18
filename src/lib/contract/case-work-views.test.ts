import { describe, expect, it } from "vitest";

import { CASE_WORK_VIEWS, caseWorkWhere } from "./case-work-views";

describe("the case list's organisation-wide work views (AC-17, FR-AWD-006)", () => {
  it("names the five views the old Awards list counted across every award", () => {
    expect([...CASE_WORK_VIEWS]).toEqual(["pending", "approved", "return", "commitment", "expired"]);
  });
  it("filters by status, return and commitment number in the database", () => {
    const w = caseWorkWhere(14, "2026-10-18");
    expect(w.pending).toEqual({ status: "PENDING_APPROVAL" });
    expect(w.approved).toEqual({ status: "APPROVED" });
    expect(w.return).toEqual({ status: "ISSUED" });
    expect(w.commitment).toEqual({ status: { in: ["ISSUED", "ACCEPTED"] }, erpCommitmentNo: null });
  });
  it("expired indents: a work indent not cancelled, not commenced, received before the validity window", () => {
    const w = caseWorkWhere(14, "2026-10-18").expired as { instrumentKind: string; status: unknown; commencedOn: null; indentReceivedOn: { lt: Date } };
    expect(w).toMatchObject({ instrumentKind: "WORK_INDENT", status: { not: "CANCELLED" }, commencedOn: null });
    expect(w.indentReceivedOn.lt).toBeInstanceOf(Date);
  });
  it("with no validity set, or no day, the expired view cannot be judged: null, so the screen says so rather than showing zero", () => {
    expect(caseWorkWhere(null, "2026-10-18").expired).toBeNull();
    expect(caseWorkWhere(14, null).expired).toBeNull();
  });
});
