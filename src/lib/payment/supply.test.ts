import { describe, expect, it } from "vitest";

import { MONEY_COLUMN_MAX_SEN, parseSen } from "@/lib/money";

import { supplyClaimState, supplyClaimWords, supplyFaultText, supplyPaymentFaults, supplyRefusal } from "./supply";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const ok = { verifiedOn: "2026-10-10", already: false, batchNo: "B-0042", paidOn: "2026-10-20", today: "2026-10-24", amount: parseSen("12500.00") };

describe("Finance's payment of a supply claim (ADR 0045 D7; WV-13)", () => {
  it("worked example: a claim verified on 10 Oct 2026, paid RM12,500 on 20 Oct in batch B-0042, recorded on 24 Oct, is taken", () => {
    expect(supplyPaymentFaults(ok)).toEqual([]);
    expect(supplyClaimWords("PAID", "Jabatan Contoh", { amount: ok.amount, paidOn: ok.paidOn, batchNo: ok.batchNo })).toBe("Paid RM12,500 on 20 Oct 2026, batch B-0042");
  });

  it("is refused before the claim is verified", () => {
    expect(codes(supplyPaymentFaults({ ...ok, verifiedOn: null }))).toEqual(["NOT_VERIFIED"]);
  });

  it("is refused a second time", () => {
    expect(codes(supplyPaymentFaults({ ...ok, already: true }))).toEqual(["PAYMENT_ALREADY_RECORDED"]);
  });

  it("needs the batch number; blank is none", () => {
    expect(codes(supplyPaymentFaults({ ...ok, batchNo: "  " }))).toEqual(["BATCH_REQUIRED"]);
  });

  it("is never dated after today; today itself is taken", () => {
    expect(supplyPaymentFaults({ ...ok, paidOn: "2026-10-25" })).toEqual([{ code: "FUTURE_DATE", level: "block", data: { day: "2026-10-25" } }]);
    expect(supplyPaymentFaults({ ...ok, paidOn: ok.today })).toEqual([]);
  });

  it("is never dated before the day it was verified; the verified day itself is taken", () => {
    expect(supplyPaymentFaults({ ...ok, paidOn: "2026-10-09" })).toEqual([{ code: "PAID_BEFORE_VERIFIED", level: "block", data: { day: "2026-10-10" } }]);
    expect(supplyPaymentFaults({ ...ok, paidOn: "2026-10-10" })).toEqual([]);
  });

  it("needs an amount, more than zero, that fits the column; one sen is taken", () => {
    expect(codes(supplyPaymentFaults({ ...ok, amount: null }))).toEqual(["AMOUNT_REQUIRED"]);
    expect(codes(supplyPaymentFaults({ ...ok, amount: 0n }))).toEqual(["AMOUNT_NOT_POSITIVE"]);
    expect(codes(supplyPaymentFaults({ ...ok, amount: -1n }))).toEqual(["AMOUNT_NOT_POSITIVE"]);
    expect(supplyPaymentFaults({ ...ok, amount: 1n })).toEqual([]);
    expect(supplyPaymentFaults({ ...ok, amount: MONEY_COLUMN_MAX_SEN })).toEqual([]);
    expect(codes(supplyPaymentFaults({ ...ok, amount: MONEY_COLUMN_MAX_SEN + 1n }))).toEqual(["AMOUNT_TOO_LARGE"]);
  });

  it("returns every fault together, never only the first", () => {
    expect(codes(supplyPaymentFaults({ verifiedOn: null, already: true, batchNo: "", paidOn: "2026-10-30", today: "2026-10-24", amount: null }))).toEqual(["NOT_VERIFIED", "PAYMENT_ALREADY_RECORDED", "BATCH_REQUIRED", "FUTURE_DATE", "AMOUNT_REQUIRED"]);
  });

  it("says every fault in words, with no code, and an unknown one fails closed", () => {
    for (const code of ["NOT_VERIFIED", "PAYMENT_ALREADY_RECORDED", "BATCH_REQUIRED", "FUTURE_DATE", "PAID_BEFORE_VERIFIED", "AMOUNT_REQUIRED", "AMOUNT_NOT_POSITIVE", "AMOUNT_TOO_LARGE", "NOT_A_SUPPLY_CLAIM", "PERSON_REQUIRED"]) {
      const t = supplyFaultText({ code, level: "block", data: { day: "2026-10-10" } });
      expect(t, code).not.toMatch(/[A-Z]{3,}_/);
      expect(t, code).not.toBe("Refused.");
    }
    expect(supplyFaultText({ code: "PAID_BEFORE_VERIFIED", level: "block", data: { day: "2026-10-10" } })).toBe("It cannot be paid before it was verified (10 Oct 2026).");
    expect(supplyFaultText({ code: "SOMETHING_ELSE", level: "block" })).toBe("Refused.");
    expect(supplyRefusal("Not recorded:", [{ code: "BATCH_REQUIRED", level: "block" }])).toBe("Not recorded: Give Finance's payment batch number.");
  });
});

describe("a supply claim's state, as both sides read it", () => {
  it("paid wins; then verified (Taken up), returned, and otherwise with the organisation", () => {
    expect(supplyClaimState({ state: "TAKEN_UP" }, true)).toBe("PAID");
    expect(supplyClaimState({ state: "TAKEN_UP" }, false)).toBe("VERIFIED");
    expect(supplyClaimState({ state: "RETURNED" }, false)).toBe("RETURNED");
    expect(supplyClaimState({ state: "RECEIVED" }, false)).toBe("WITH_ORGANISATION");
  });

  it("is worded with the organisation's name, never a code", () => {
    expect(supplyClaimWords("WITH_ORGANISATION", "Jabatan Contoh", null)).toBe("With Jabatan Contoh");
    expect(supplyClaimWords("RETURNED", "Jabatan Contoh", null)).toBe("Returned");
    expect(supplyClaimWords("VERIFIED", "Jabatan Contoh", null)).toBe("Verified");
    expect(supplyClaimWords("PAID", "Jabatan Contoh", { amount: parseSen("1234.56"), paidOn: "2026-10-20", batchNo: "B1" })).toBe("Paid RM1,234.56 on 20 Oct 2026, batch B1");
  });
});
