import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { claimsCommitteeFaults, lossLineFaults, lossRecordFaults, lossSendFaults, lossValueFaults } from "./loss-expense";

/** 6.13 Part B run 1b: loss and expense (FR-EOT-006, OD-B20 as ruled BD-613-88, BD-613-128 (2) act side). Pure. */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("loss and expense", () => {
  it("recorded with what is claimed, never below nothing", () => {
    expect(lossRecordFaults({ claimed: parseSen("12000.00") })).toEqual([]);
    expect(lossRecordFaults({ claimed: 0n })).toEqual([]);
    expect(codes(lossRecordFaults({ claimed: null }))).toEqual(["CLAIMED_REQUIRED"]);
    expect(codes(lossRecordFaults({ claimed: -1n }))).toEqual(["CLAIMED_REQUIRED"]);
  });

  it("valued: the amount, its basis and the day; not once sent", () => {
    const ok = { sent: false, valued: parseSen("9500.00"), basis: "Prolongation of site overheads, 14 days.", valuedOn: "2026-09-20", today: "2026-09-21" };
    expect(lossValueFaults(ok)).toEqual([]);
    expect(codes(lossValueFaults({ ...ok, sent: true }))).toEqual(["VALUED_ALREADY_SENT"]);
    expect(codes(lossValueFaults({ ...ok, valued: null, basis: "" }))).toEqual(["VALUED_REQUIRED", "VALUATION_BASIS_REQUIRED"]);
    expect(codes(lossValueFaults({ ...ok, valuedOn: "2026-09-22" }))).toEqual(["FUTURE_DATE"]);
  });

  it("sent once valued", () => {
    expect(codes(lossSendFaults({ valued: null }))).toEqual(["NOT_VALUED"]);
    expect(lossSendFaults({ valued: 0n })).toEqual([]);
  });

  it("OD-B20: the route's committee step must be the type's claims committee; null with a committee step warns; no step compares nothing", () => {
    const claims = { code: "VOC", name: "Variation Orders Committee" };
    expect(claimsCommitteeFaults(["VOC"], claims, (c) => c)).toEqual([]);
    expect(claimsCommitteeFaults([], claims, (c) => c)).toEqual([]);
    const f = claimsCommitteeFaults(["TBC"], claims, (c) => (c === "TBC" ? "Tender Board" : c));
    expect(f).toEqual([{ code: "CLAIMS_COMMITTEE_MISMATCH", level: "block", data: { committee: "Tender Board", claims: "Variation Orders Committee" } }]);
    expect(claimsCommitteeFaults(["TBC"], null, (c) => c)).toEqual([{ code: "CLAIMS_COMMITTEE_NOT_SET", level: "warn" }]);
    expect(claimsCommitteeFaults([], null, (c) => c)).toEqual([]);
  });

  it("only an approved claim enters a 1.2 loss-and-expense line", () => {
    expect(lossLineFaults({ approved: true, label: "Loss and expense CM/1" })).toEqual([]);
    expect(lossLineFaults({ approved: false, label: "Loss and expense CM/1" })).toEqual([{ code: "LOSS_NOT_APPROVED", level: "block", data: { claim: "Loss and expense CM/1" } }]);
  });
});
