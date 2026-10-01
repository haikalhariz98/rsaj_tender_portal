import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { bandSetFaults, liabilityLimit, limitFault, type LiabilityBand } from "./liability";
import { SK004_LIABILITY_BANDS } from "./fixture";

const RM = parseSen;

describe("the public-liability limit, (min, max] (SK004 §7.3.3(c) as transcribed, ASSUMED)", () => {
  const bands = SK004_LIABILITY_BANDS;
  const limit = (p: string) => {
    const r = liabilityLimit(bands, RM(p));
    return r.state === "SET" ? r.limit : r.state;
  };

  it("RM25,000.00 is the first band: RM10,000", () => expect(limit("25000.00")).toBe(RM("10000")));
  it("RM25,000.50 falls in the printed table's sen gap: no band, refused", () => expect(limit("25000.50")).toBe("NO_BAND"));
  it("RM25,001.00 is the second band: RM25,000", () => expect(limit("25001.00")).toBe(RM("25000")));
  it("RM1,000,000.00 is the sixth band: RM150,000", () => expect(limit("1000000.00")).toBe(RM("150000")));
  it("RM2.1 million is above RM1 million: RM200,000", () => expect(limit("2100000")).toBe(RM("200000")));

  it("a price two bands both hold is ambiguous, naming both — never the first", () => {
    const b = (code: string, min: string | null, max: string | null): LiabilityBand => ({ code, minValue: min ? RM(min) : null, maxValue: max ? RM(max) : null, limit: RM("1") });
    expect(liabilityLimit([b("a", null, "100"), b("b", "90", null)], RM("95"))).toEqual({ state: "AMBIGUOUS", bands: ["a", "b"] });
  });
  it("a band retired by the day judged on no longer applies", () => {
    const retired = bands.map((x) => ({ ...x, retiredOn: new Date("2026-09-01T00:00:00Z") }));
    expect(liabilityLimit(retired, RM("50000"), new Date("2026-09-30T00:00:00Z"))).toEqual({ state: "NOT_SET" });
    expect(liabilityLimit(retired, RM("50000"), new Date("2026-08-30T00:00:00Z")).state).toBe("SET");
  });

  it("no bands configured is not set, never a limit", () => expect(liabilityLimit([], RM("50000"))).toEqual({ state: "NOT_SET" }));

  it("checks the set: the printed table's five sen gaps are listed", () => {
    const gaps = bandSetFaults(bands).filter((f) => f.kind === "GAP");
    expect(gaps).toHaveLength(5);
    expect(gaps[0]).toEqual({ kind: "GAP", after: RM("25000"), before: RM("25000.99") });
  });

  it("a contiguous set has no faults, and an overlap is named", () => {
    const b = (code: string, min: string | null, max: string | null): LiabilityBand => ({ code, minValue: min ? RM(min) : null, maxValue: max ? RM(max) : null, limit: RM("1") });
    expect(bandSetFaults([b("a", null, "100"), b("b", "100", null)])).toEqual([]);
    expect(bandSetFaults([b("a", null, "100"), b("b", "90", null)])).toEqual([{ kind: "OVERLAP", a: "a", b: "b" }]);
  });
});

describe("raising the limit (FR-AWD-013)", () => {
  it("may be raised only with a justification, never lowered", () => {
    expect(limitFault(RM("200000"), RM("200000"), "")).toBeNull();
    expect(limitFault(RM("200000"), RM("500000"), "")).toBe("JUSTIFICATION_REQUIRED");
    expect(limitFault(RM("200000"), RM("500000"), "Works beside a live trunk main.")).toBeNull();
    expect(limitFault(RM("200000"), RM("150000"), "Cheaper")).toBe("LOWERED");
  });
});
