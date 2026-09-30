import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import type { InsuranceKind } from "@/lib/securities/insurance";
import type { DecisionRecord } from "@/lib/committee/record";

import { despatchFaults, distributionComplete, distributionList, type Recipient } from "./distribution";
import { readinessGate } from "./readiness";
import { approverBlock, committeeBlock, receivedOnFault } from "./routing";
import { selectVariant, type Variant } from "./variant";

const rcp = (id: string, extra: Partial<Recipient> = {}): Recipient => ({ id, instrumentKind: "LETTER_OF_ACCEPTANCE", nameEn: id, mandatory: true, onlyWhenRegulated: false, sortOrder: 0, retiredOn: null, ...extra });
// SK003 7.9.3 shape: four recipients, and the regulator only for regulated works. Never seeded.
const FIVE = [rcp("implementing"), rcp("finance"), rcp("construction_board"), rcp("tax"), rcp("water_regulator", { onlyWhenRegulated: true })];

describe("the distribution list (FR-AWD-004)", () => {
  const count = (r: ReturnType<typeof distributionList>) => ("rows" in r ? r.rows.filter((x) => !x.isAwardee).length : r.fault);
  it("five recipients for the regulated activity, four otherwise, plus the awardee's own copy", () => {
    expect(count(distributionList(FIVE, "LETTER_OF_ACCEPTANCE", true, "Demo Works"))).toBe(5);
    expect(count(distributionList(FIVE, "LETTER_OF_ACCEPTANCE", false, "Demo Works"))).toBe(4);
    const r = distributionList(FIVE, "LETTER_OF_ACCEPTANCE", false, "Demo Works");
    expect("rows" in r && r.rows.filter((x) => x.isAwardee).map((x) => x.recipientName)).toEqual(["Demo Works"]);
  });
  it("cannot be drawn while nobody has said whether the works are regulated", () => {
    expect(distributionList(FIVE, "LETTER_OF_ACCEPTANCE", null, "Demo Works")).toEqual({ fault: "REGULATED_NOT_ANSWERED" });
  });
  it("no recipients configured for the instrument refuses", () => {
    expect(distributionList(FIVE, "WORK_INDENT", false, "Demo Works")).toEqual({ fault: "RECIPIENTS_NOT_SET" });
  });
});

describe("recording a despatch (FR-AWD-005)", () => {
  const ctx = { today: "2026-09-30", issuedOn: "2026-09-10" };
  it("registered post needs its consignment reference", () => {
    expect(despatchFaults({ method: "REGISTERED_POST", consignmentRef: "", despatchedOn: "2026-09-11", acknowledgedOn: null }, ctx)).toEqual(["CONSIGNMENT_REQUIRED"]);
    expect(despatchFaults({ method: "REGISTERED_POST", consignmentRef: "RR000000001MY", despatchedOn: "2026-09-11", acknowledgedOn: null }, ctx)).toEqual([]);
  });
  it("a collection records its day; an acknowledgement is never before the despatch", () => {
    expect(despatchFaults({ method: "COLLECTION", consignmentRef: "", despatchedOn: "2026-09-12", acknowledgedOn: "2026-09-12" }, ctx)).toEqual([]);
    expect(despatchFaults({ method: "BY_HAND", consignmentRef: "", despatchedOn: "2026-09-12", acknowledgedOn: "2026-09-11" }, ctx)).toEqual(["ACK_BEFORE_DESPATCH"]);
  });
  it("no future days, nothing before the issue", () => {
    expect(despatchFaults({ method: "BY_HAND", consignmentRef: "", despatchedOn: "2026-10-01", acknowledgedOn: null }, ctx)).toEqual(["FUTURE_DATE"]);
    expect(despatchFaults({ method: "BY_HAND", consignmentRef: "", despatchedOn: "2026-09-01", acknowledgedOn: null }, ctx)).toEqual(["BEFORE_ISSUE"]);
  });
  it("is complete when every mandatory copy has gone", () => {
    expect(distributionComplete([{ mandatory: true, despatchedOn: "x" }, { mandatory: true, despatchedOn: null }]).complete).toBe(false);
    expect(distributionComplete([{ mandatory: true, despatchedOn: "x" }, { mandatory: false, despatchedOn: null }]).complete).toBe(true);
  });
});

// FR-AWD-007's six variants, on two terms bands either side of the letters' own split. Never seeded.
const v = (code: string, types: string[], band: string | null, extra: Partial<Variant> = {}): Variant => ({ id: code, code, nameEn: code, templateId: `t_${code}`, contractTypeCodes: types, termsBandKey: band, nonCommencement: "CANCEL_AND_BLACKLIST", retiredOn: null, ...extra });
const SIX = [
  v("ds_below", ["direct_selective"], "below"),
  v("oneshot_below", ["one_shot"], "below"),
  v("oneshot_above", ["one_shot"], "above"),
  v("itqa_below", ["it_qa"], "below"),
  v("itqa_above", ["it_qa"], "above"),
  v("sor", ["schedule_of_rates"], null, { nonCommencement: "WARNING_LETTER" }),
];

describe("the appointment-letter variant (FR-AWD-007)", () => {
  const pick = (type: string, band: string | null, state = "APPLIES") => {
    const r = selectVariant(SIX, type, { state, bandKey: band });
    return r.state === "SELECTED" ? r.variant.code : r.state;
  };
  it("picks by contract type and terms band", () => {
    expect(pick("one_shot", "below")).toBe("oneshot_below");
    expect(pick("one_shot", "above")).toBe("oneshot_above");
    expect(pick("it_qa", "above")).toBe("itqa_above");
    expect(pick("schedule_of_rates", "above")).toBe("sor");
  });
  it("an exercise with no terms band set is never guessed", () => {
    expect(pick("one_shot", null, "NOT_SET")).toBe("TERMS_NOT_SET");
  });
  it("no variant, or two equally specific, refuses", () => {
    expect(pick("direct_selective", "above")).toBe("NONE");
    expect(selectVariant([...SIX, v("dup", ["one_shot"], "below")], "one_shot", { state: "APPLIES", bandKey: "below" })).toEqual({ state: "AMBIGUOUS", codes: ["oneshot_below", "dup"] });
  });
});

describe("the readiness gate (FR-CON-008)", () => {
  const base = {
    returned: true,
    bondRequired: true as boolean | null,
    bondNotRequiredReason: "",
    requiredBond: { state: "SET" as const, amount: parseSen("26937.70"), basis: "ANNUAL_VALUE" as const },
    bonds: [{ kind: "PERFORMANCE_BOND", status: "VERIFIED", value: parseSen("26937.70") }],
    requirements: [{ code: "works", nameEn: "Works", kind: "WORKS" as const, contractTypeCode: null, required: true, percent: null, tailMonths: 3, tailDays: 14 }],
    policies: [{ kind: "CAR" as InsuranceKind, substitutesFor: "WORKS" as InsuranceKind | null, status: "VERIFIED" }],
  };
  const state = (x: Partial<typeof base>, key: string) => readinessGate({ ...base, ...x }).items.find((i) => i.key === key)!.state;
  it("is ready when all three are met, a CAR policy standing in for works", () => {
    expect(readinessGate(base).ready).toBe(true);
  });
  it("an undecided bond, or an unset basis, is not set — never met", () => {
    expect(state({ bondRequired: null }, "BOND")).toBe("NOT_SET");
    expect(state({ requiredBond: { state: "NOT_SET", missing: ["BASIS"] } as never }, "BOND")).toBe("NOT_SET");
  });
  it("no bond required is met only with its reason recorded", () => {
    expect(state({ bondRequired: false, bondNotRequiredReason: "Supply of goods under the short-form terms." }, "BOND")).toBe("MET");
    expect(state({ bondRequired: false }, "BOND")).toBe("NOT_SET");
  });
  it("a bond or policy lodged but not verified is not met", () => {
    expect(state({ bonds: [{ kind: "PERFORMANCE_BOND", status: "LODGED", value: parseSen("26937.70") }] }, "BOND")).toBe("NOT_MET");
    expect(state({ policies: [{ kind: "WORKS", substitutesFor: null, status: "LODGED" }] }, "INSURANCE")).toBe("NOT_MET");
  });
  it("no requirements configured is not set", () => {
    expect(state({ requirements: [] }, "INSURANCE")).toBe("NOT_SET");
  });
  it("is cumulative: an instrument not returned holds the gate", () => {
    expect(readinessGate({ ...base, returned: false }).ready).toBe(false);
  });
});

describe("the routing-sheet blocks (FR-CTE-014)", () => {
  const rec = { committee: "Tender Board", meetingReference: "S/1", meetingDate: new Date("2026-08-20T00:00:00Z"), outcome: "CARRIED", decisionDate: new Date("2026-08-20T00:00:00Z") } as DecisionRecord;
  it("the committee block comes from the decision record, and says not decided without one", () => {
    expect(committeeBlock(null, false)).toEqual({ state: "NOT_DECIDED" });
    expect(committeeBlock(rec, true)).toMatchObject({ state: "DECIDED", committee: "Tender Board", meetingReference: "S/1", outcome: "CARRIED", minuted: true });
  });
  it("the approver's block reads the approving person step; a day received not recorded stays null", () => {
    const steps = [
      { act: "MR", committeeCode: "QC", roleLabel: "Quotation Committee", receivedOn: null, decidedByName: "Quotation Committee", decidedOn: new Date("2026-09-01T00:00:00Z"), decision: "DONE" },
      { act: "A", committeeCode: null, roleLabel: "Chief Executive", receivedOn: null, decidedByName: "A. Rahman", decidedOn: new Date("2026-09-03T00:00:00Z"), decision: "DONE" },
    ];
    expect(approverBlock(steps)).toEqual({ roleLabel: "Chief Executive", receivedOn: null, approverName: "A. Rahman", decidedOn: new Date("2026-09-03T00:00:00Z") });
  });
  it("a day received is on or before the decision, never in the future", () => {
    expect(receivedOnFault("2026-09-02", "2026-09-03", "2026-09-30", "2026-09-01")).toBeNull();
    expect(receivedOnFault("2026-09-04", "2026-09-03", "2026-09-30", "2026-09-01")).toBe("RECEIVED_AFTER_DECISION");
    expect(receivedOnFault("2026-10-04", "2026-10-05", "2026-09-30", "2026-09-01")).toBe("RECEIVED_IN_FUTURE");
  });
});
