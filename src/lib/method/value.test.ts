import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { SPEC_MATRIX } from "./fixture";
import { findingText } from "./labels";
import { exerciseValueFaults, type ApprovedRoute } from "./value";

const approved: ApprovedRoute = { value: parseSen("330000.00"), ruleKey: "REQ_OVER", ruleLabel: "Above RM300,000", checkedAgainstMatrix: true };
const sib = (id: string, v: string, status: "DRAFT" | "DOCUMENTS_IN_PREPARATION" | "CANCELLED" = "DRAFT") => ({ id, value: parseSen(v), status });
const draft = (v: string, rule = "REQ_OVER") => ({ id: null, value: parseSen(v), requisitionRuleKey: rule, requisitionRuleLabel: rule });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("exercises may not outgrow their requisition's approval (ruling R-16)", () => {
  it("live siblings plus this one above the approved value is refused, naming the three exits", () => {
    const f = exerciseValueFaults(approved, [sib("a", "300000.00"), sib("b", "21000.00")], draft("9000.01"), SPEC_MATRIX.policy);
    const exceeds = f.find((x) => x.code === "EXCEEDS_APPROVED_VALUE")!;
    expect(exceeds.level).toBe("block");
    const text = findingText(exceeds);
    expect(text).toMatch(/RM330,000\.01/);
    expect(text).toMatch(/Reduce this exercise's value/);
    expect(text).toMatch(/cancel a sibling exercise/);
    expect(text).toMatch(/cancel this exercise and raise a separate requisition/);
    // 6.1 has no path to abandon a requisition: the exits never read as cancelling it (ruling on BD-1).
    expect(text).not.toMatch(/cancel (the|this) requisition/i);
    expect(text).toMatch(/The requisition itself stays as approved/);
  });
  it("exactly the approved value passes, and cancelled siblings do not count", () => {
    expect(codes(exerciseValueFaults(approved, [sib("a", "300000.00"), sib("b", "21000.00")], draft("9000.00"), SPEC_MATRIX.policy))).not.toContain("EXCEEDS_APPROVED_VALUE");
    expect(codes(exerciseValueFaults(approved, [sib("a", "300000.00"), sib("c", "50000.00", "CANCELLED")], draft("30000.00"), SPEC_MATRIX.policy))).not.toContain("EXCEEDS_APPROVED_VALUE");
  });
  it("an exercise's own row is not counted twice when its value changes", () => {
    const f = exerciseValueFaults(approved, [sib("me", "330000.00")], { ...draft("330000.00"), id: "me" }, SPEC_MATRIX.policy);
    expect(codes(f)).not.toContain("EXCEEDS_APPROVED_VALUE");
  });
  it("no approved route refuses outright", () => {
    expect(codes(exerciseValueFaults(null, [], draft("1.00"), SPEC_MATRIX.policy))).toEqual(["NO_APPROVED_ROUTE"]);
  });
});

describe("splits across a regime and the requisition band", () => {
  it("siblings together in another regime warn with the combined value", () => {
    const f = exerciseValueFaults(approved, [sib("a", "300000.00")], draft("21000.00"), SPEC_MATRIX.policy);
    const s = f.find((x) => x.code === "SPLIT_ACROSS_REGIME")!;
    expect(s.level).toBe("warn");
    expect(findingText(s)).toMatch(/RM321,000\.00/);
  });
  it("a value in a different requisition band from the approved route's rule warns", () => {
    const f = exerciseValueFaults(approved, [], draft("9000.00", "REQ_50K"), SPEC_MATRIX.policy);
    expect(f.find((x) => x.code === "REQUISITION_BAND_CHANGED")?.level).toBe("warn");
  });
  it("a route received from outside is not assessed, never called changed", () => {
    const f = exerciseValueFaults({ ...approved, ruleKey: null, checkedAgainstMatrix: false }, [], draft("9000.00", "REQ_50K"), SPEC_MATRIX.policy);
    expect(codes(f)).toEqual(["REQUISITION_BAND_NOT_CHECKED"]);
  });
});
