import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { sumDetailText } from "./gate-words";
import { governedAs, sumFindings, type Governing, type InsuredKind } from "./insurance-terms";

/**
 * Review 13 (a flagged step of 6.11): a contractor's or erection all risks policy required in its own right is
 * compared with the governing figure for the works it insures, or said "not compared" — never skipped. Invented
 * figures, for tests only.
 */

const RM = (s: string) => parseSen(s);
const gov = (works: Governing): Record<InsuredKind, Governing> => ({ WORKS: works, PUBLIC_LIABILITY: { state: "NOT_STATED" }, WORKMENS_COMPENSATION: { state: "NOT_STATED" } });
const WORKS_FIGURE: Governing = { state: "APPENDIX", sen: RM("1185259.46") };
const car = (sum: string, substitutesFor: "WORKS" | null = null) => ({ kind: "CAR" as const, substitutesFor, status: "VERIFIED", sumInsured: RM(sum) });

describe("an all-risks policy required in its own right", () => {
  it("is judged against the works' figure", () => {
    expect(governedAs("CAR")).toBe("WORKS");
    expect(governedAs("EAR")).toBe("WORKS");
    expect(governedAs("PUBLIC_LIABILITY")).toBe("PUBLIC_LIABILITY");
  });
  it("a sen short is a shortfall naming CAR; at the figure, met", () => {
    expect(sumFindings(["CAR"], gov(WORKS_FIGURE), [car("1185259.45")])).toEqual([{ kind: "CAR", state: "SHORT", governing: WORKS_FIGURE, insured: RM("1185259.45") }]);
    expect(sumFindings(["CAR"], gov(WORKS_FIGURE), [car("1185259.46")])).toEqual([]);
  });
  it("EAR the same way", () => {
    expect(sumFindings(["EAR"], gov(WORKS_FIGURE), [{ kind: "EAR", substitutesFor: null, status: "VERIFIED", sumInsured: RM("100") }]).map((f) => f.state)).toEqual(["SHORT"]);
  });
  it("with nothing stated for the works, it is said not compared, in words", () => {
    const f = sumFindings(["CAR"], gov({ state: "NOT_STATED" }), [car("1")]);
    expect(f).toEqual([{ kind: "CAR", state: "NOT_STATED" }]);
    expect(sumDetailText("SUM_NOT_STATED:CAR")).toMatch(/states a sum insured for the works it insures, so it is not compared\.$/);
  });
  it("not verified: the gate's 'not verified', not a shortfall; a CAR accepted for the works still counts as the works", () => {
    expect(sumFindings(["CAR"], gov(WORKS_FIGURE), [{ ...car("1"), status: "LODGED" }])).toEqual([]);
    expect(sumFindings(["WORKS"], gov(WORKS_FIGURE), [car("1", "WORKS")]).map((f) => f.kind)).toEqual(["WORKS"]);
  });
});
