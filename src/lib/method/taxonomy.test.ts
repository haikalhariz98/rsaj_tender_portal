import { describe, expect, it } from "vitest";

import { SPEC_MAPPINGS, SPEC_TAXONOMIES } from "./fixture";
import { classificationTaxonomies, deriveTaxonomies } from "./taxonomy";

const on = new Date("2026-09-30T00:00:00Z");
const by = (o: ReturnType<typeof deriveTaxonomies>) => Object.fromEntries(o.map((x) => [x.taxonomyCode, [x.state, x.valueCode]]));

describe("the other taxonomies, from the canonical type (FR-MTD-014)", () => {
  it("setting the type once fills every configured taxonomy without further input", () => {
    expect(by(deriveTaxonomies("SUPPLY", "BQ", [], SPEC_MAPPINGS, SPEC_TAXONOMIES, on))).toEqual({
      CPD: ["DERIVED", "CPD_SUPPLY"],
      EVAL: ["DERIVED", "EVAL_GENERAL"],
      REPORT: ["DERIVED", "REPORT_SUPPLY"],
      PANEL: ["DERIVED", "PANEL_GENERAL"],
    });
  });
  it("a row conditioned on the basis beats an unconditioned one", () => {
    expect(by(deriveTaxonomies("WORK", "DS", [], SPEC_MAPPINGS, SPEC_TAXONOMIES, on)).REPORT).toEqual(["DERIVED", "REPORT_DB"]);
  });
  it("two candidates are ambiguous, listed, and a stored pick resolves it as chosen", () => {
    const amb = deriveTaxonomies("WORK", "BQ", [], SPEC_MAPPINGS, SPEC_TAXONOMIES, on).find((x) => x.taxonomyCode === "REPORT")!;
    expect(amb.state).toBe("AMBIGUOUS");
    expect(amb.candidates).toEqual(["REPORT_DB", "REPORT_WORKS"]);
    const picked = deriveTaxonomies("WORK", "BQ", [{ taxonomyCode: "REPORT", valueCode: "REPORT_WORKS", pick: "CHOSEN" }], SPEC_MAPPINGS, SPEC_TAXONOMIES, on);
    expect(by(picked).REPORT).toEqual(["CHOSEN", "REPORT_WORKS"]);
  });
  it("a pick no longer among the candidates does not resolve it", () => {
    const stale = deriveTaxonomies("WORK", "BQ", [{ taxonomyCode: "REPORT", valueCode: "REPORT_SUPPLY", pick: "CHOSEN" }], SPEC_MAPPINGS, SPEC_TAXONOMIES, on);
    expect(by(stale).REPORT[0]).toBe("AMBIGUOUS");
  });
  it("a row conditioned on another taxonomy's value applies once that value is settled", () => {
    const withEval = SPEC_MAPPINGS.map((m) => (m.contractTypeCode === "SUPPLY" && m.taxonomyCode === "EVAL" ? { ...m, valueCode: "EVAL_WORKS" } : m));
    expect(by(deriveTaxonomies("SUPPLY", "BQ", [], withEval, SPEC_TAXONOMIES, on)).PANEL).toEqual(["DERIVED", "PANEL_CIVIL"]);
  });
  it("no row is not mapped; no type waits for one", () => {
    expect(by(deriveTaxonomies("SERVICE", "BQ", [], SPEC_MAPPINGS, SPEC_TAXONOMIES, on)).CPD).toEqual(["NOT_MAPPED", null]);
    expect(deriveTaxonomies(null, null, [], SPEC_MAPPINGS, SPEC_TAXONOMIES, on).every((x) => x.state === "AWAITING_TYPE")).toBe(true);
  });
  it("never derives the basis: the basis is an input only (ruling R-9)", () => {
    const codes = deriveTaxonomies("WORK", "BQ", [], SPEC_MAPPINGS, SPEC_TAXONOMIES, on).map((x) => x.taxonomyCode);
    expect(codes).not.toContain("BASIS");
    expect(codes).toHaveLength(SPEC_TAXONOMIES.length);
  });
});

describe("6.4 increment 2: a list a policy keeps is not a classification", () => {
  it("the regulator-permit list is left out of what classifies a contract; nothing else is", () => {
    const all = [{ code: "report" }, { code: "permits" }, { code: "evaluation" }];
    expect(classificationTaxonomies(all, ["permits"]).map((t) => t.code)).toEqual(["report", "evaluation"]);
    expect(classificationTaxonomies(all, [null, undefined])).toEqual(all);
  });
});
