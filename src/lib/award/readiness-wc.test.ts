import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import type { InsuranceKind } from "@/lib/securities/insurance";

import { readinessGate, wcCheckRecordedOn } from "./readiness";

/**
 * 6.12 (BD-20 carry, flagged against 6.11, new tests only): a workmen's compensation policy on uncovered
 * wages meets the gate once a check of the declared wages is recorded on the verified policy. Recorded,
 * not judged: no configured basis compares the wages with the sum insured (D4). Without the recorded
 * check, BD-15 stands exactly as before.
 */

const wc = { code: "wc", nameEn: "Workmen's compensation", kind: "WORKMENS_COMPENSATION" as const, contractTypeCode: null, required: true, percent: null, tailMonths: 3, tailDays: 14 };
const base = {
  returned: true,
  bondRequired: true as boolean | null,
  bondNotRequiredReason: "",
  requiredBond: { state: "SET" as const, amount: parseSen("100.00"), basis: "STATED_AMOUNT" as const },
  bonds: [{ kind: "PERFORMANCE_BOND", status: "VERIFIED", value: parseSen("100.00") }],
  requirements: [wc],
  policies: [{ kind: "WORKMENS_COMPENSATION" as InsuranceKind, substitutesFor: null, status: "VERIFIED" }],
  wcBasis: "UNCOVERED_WAGES" as const,
};

describe("the recorded uncovered-wages check (6.12)", () => {
  it("meets the insurance item, said as recorded and not judged", () => {
    const g = readinessGate({ ...base, wcCheckRecorded: true });
    expect(g.ready).toBe(true);
    expect(g.items.find((i) => i.key === "INSURANCE")).toEqual({ key: "INSURANCE", state: "MET", detail: ["WC_RECORDED_NOT_JUDGED"] });
  });
  it("without it, BD-15 stands: not checked, never met", () => {
    expect(readinessGate({ ...base, wcCheckRecorded: false }).items.find((i) => i.key === "INSURANCE")!.state).toBe("NOT_SET");
    expect(readinessGate(base).ready).toBe(false);
  });
  it("changes nothing on a percentage basis or an unset one", () => {
    expect(readinessGate({ ...base, wcBasis: "PERCENT_OF_CONTRACT" as never, wcCheckRecorded: true }).items.find((i) => i.key === "INSURANCE")!.detail).toEqual([]);
    expect(readinessGate({ ...base, wcBasis: null as never, wcCheckRecorded: true }).items.find((i) => i.key === "INSURANCE")!.detail).toEqual(["WC_BASIS_NOT_SET"]);
  });
  it("counts only a verified workmen's compensation policy with a check day", () => {
    const on = new Date("2026-03-01");
    expect(wcCheckRecordedOn([{ kind: "WORKMENS_COMPENSATION", status: "VERIFIED", wcCheckedOn: on }])).toBe(true);
    expect(wcCheckRecordedOn([{ kind: "WORKMENS_COMPENSATION", status: "LODGED", wcCheckedOn: on }])).toBe(false);
    expect(wcCheckRecordedOn([{ kind: "PUBLIC_LIABILITY", status: "VERIFIED", wcCheckedOn: on }])).toBe(false);
    expect(wcCheckRecordedOn([{ kind: "WORKMENS_COMPENSATION", status: "VERIFIED", wcCheckedOn: null }])).toBe(false);
  });
});
