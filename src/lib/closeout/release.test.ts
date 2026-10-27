import { describe, expect, it } from "vitest";

import { balanceEventOf, balanceReleaseFaults, beforeCertificateFault, returnTriggerOf, securityReturnFaults, type SecurityReturnInput } from "./release";

/** Plan closeout-plan.md CO-6, CO-7, §4.5, §6.3; ADR 0047 D3; rulings 7, 11, 14. */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const facts = { dlpApplies: true, cmgdIssued: false, finalInspectionRecorded: false, finalPaid: false };

describe("balanceEventOf: both switches by both events", () => {
  it("MAKING_GOOD is reached with the CMGD and its final inspection", () => {
    expect(balanceEventOf("MAKING_GOOD", facts)).toEqual({ state: "NOT_REACHED", event: "MAKING_GOOD", missing: "MAKING_GOOD" });
    expect(balanceEventOf("MAKING_GOOD", { ...facts, cmgdIssued: true })).toEqual({ state: "NOT_REACHED", event: "MAKING_GOOD", missing: "FINAL_INSPECTION" });
    expect(balanceEventOf("MAKING_GOOD", { ...facts, cmgdIssued: true, finalInspectionRecorded: true })).toEqual({ state: "REACHED", event: "MAKING_GOOD" });
  });
  it("FINAL_PAYMENT is reached with Finance's payment of the final certificate", () => {
    expect(balanceEventOf("FINAL_PAYMENT", { ...facts, cmgdIssued: true, finalInspectionRecorded: true })).toEqual({ state: "NOT_REACHED", event: "FINAL_PAYMENT", missing: "FINAL_PAYMENT" });
    expect(balanceEventOf("FINAL_PAYMENT", { ...facts, finalPaid: true })).toEqual({ state: "REACHED", event: "FINAL_PAYMENT" });
  });
  it("no DLP reads MAKING_GOOD as FINAL_PAYMENT; unset is not set", () => {
    expect(balanceEventOf("MAKING_GOOD", { ...facts, dlpApplies: false })).toEqual({ state: "NOT_REACHED", event: "FINAL_PAYMENT", missing: "FINAL_PAYMENT" });
    expect(balanceEventOf(null, facts)).toEqual({ state: "NOT_SET" });
  });
  it("the balance's own act is refused under FINAL_PAYMENT, whatever stands", () => {
    expect(codes(balanceReleaseFaults({ state: "REACHED", event: "FINAL_PAYMENT" }))).toEqual(["BALANCE_WITH_FINAL_PAYMENT"]);
    expect(balanceReleaseFaults({ state: "REACHED", event: "MAKING_GOOD" })).toEqual([]);
  });
});

describe("securityReturnFaults (CO-7)", () => {
  const reached = { state: "REACHED", event: "MAKING_GOOD" } as const;
  const ok: SecurityReturnInput = { kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", status: "VERIFIED", returned: false, officialReceiptRef: "", performanceEvent: reached, retentionEvent: reached, advanceRecouped: null };
  it("returns a performance bond at its event, once", () => {
    expect(securityReturnFaults(ok)).toEqual([]);
    expect(codes(securityReturnFaults({ ...ok, returned: true }))).toEqual(["ALREADY_RETURNED"]);
    expect(codes(securityReturnFaults({ ...ok, performanceEvent: { state: "NOT_SET" } }))).toEqual(["EVENT_NOT_SET"]);
    expect(codes(securityReturnFaults({ ...ok, performanceEvent: { state: "NOT_REACHED", event: "MAKING_GOOD", missing: "MAKING_GOOD" } }))).toEqual(["EVENT_NOT_REACHED"]);
  });
  it("cash without its official receipt is refused; the design guarantee bond survives; a rejected one holds nothing", () => {
    expect(codes(securityReturnFaults({ ...ok, form: "CASH" }))).toEqual(["OFFICIAL_RECEIPT_REQUIRED"]);
    expect(securityReturnFaults({ ...ok, form: "BANKERS_DRAFT", officialReceiptRef: "OR-1" })).toEqual([]);
    expect(codes(securityReturnFaults({ ...ok, kind: "DESIGN_GUARANTEE_BOND" }))).toEqual(["DGB_SURVIVES"]);
    expect(codes(securityReturnFaults({ ...ok, status: "REJECTED" }))).toEqual(["NOT_HELD"]);
  });
  it("the retention bond follows the balance's event; the advance guarantee its recoupment", () => {
    expect(codes(securityReturnFaults({ ...ok, kind: "RETENTION_BOND", retentionEvent: { state: "NOT_SET" } }))).toEqual(["EVENT_NOT_SET"]);
    expect(codes(securityReturnFaults({ ...ok, kind: "ADVANCE_PAYMENT_GUARANTEE", advanceRecouped: false }))).toEqual(["ADVANCE_NOT_RECOUPED"]);
    expect(securityReturnFaults({ ...ok, kind: "ADVANCE_PAYMENT_GUARANTEE", advanceRecouped: true })).toEqual([]);
    expect(returnTriggerOf({ ...ok, kind: "ADVANCE_PAYMENT_GUARANTEE" })).toBe("ADVANCE_RECOUPED");
    expect(returnTriggerOf(ok)).toBe("MAKING_GOOD");
  });
});

// Code review of close-out stage B, F4.
describe("beforeCertificateFault", () => {
  it("refuses a day before the CMGD's issue, allows its issue day and after, and judges nothing with no issue day", () => {
    expect(beforeCertificateFault("2026-10-01", "2026-10-02")?.code).toBe("BEFORE_CERTIFICATE");
    expect(beforeCertificateFault("2026-10-02", "2026-10-02")).toBeNull();
    expect(beforeCertificateFault("2026-10-01", null)).toBeNull();
  });
});
