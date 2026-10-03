import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { positionOf } from "./position";

/**
 * Run 3 residual M1. Worked example a finance person can check by hand: the original contract sum RM480,000.00; one
 * adjustment issued with a net of +RM20,285.00, so the revised sum is RM500,285.00. A second issued adjustment whose
 * issue froze no net cannot be added in: the screen says which one, and reads no revised sum at all rather than
 * RM500,285.00 (which would silently leave it out) or a throw that takes the page down.
 */
const S = parseSen;
const row = (id: string, net: string | null, status = "ISSUED") => ({
  id,
  certificate: { id: `c-${id}`, number: `DEMO/CERT/${id}`, status, issuedAt: new Date("2026-09-11T00:00:00Z"), issueSnapshot: net == null ? { figures: { totals: [] } } : { figures: { totals: [{ key: "net13", value: net }] } } },
});

describe("the contract sum's position, as a screen reads it", () => {
  it("issued adjustments read: the revised sum and the base as set", () => {
    const p = positionOf({ original: S("480000.00"), adjustments: [row("A", "20285.00"), row("B", null, "DRAFT")], variationBase: "REVISED" });
    expect(p.refused).toBeNull();
    expect(p.revised).toBe(S("500285.00"));
    expect(p.base).toBe(S("500285.00"));
    expect(positionOf({ original: S("480000.00"), adjustments: [row("A", "20285.00")], variationBase: "ORIGINAL" }).base).toBe(S("480000.00"));
    expect(positionOf({ original: S("480000.00"), adjustments: [row("A", "20285.00")], variationBase: null }).base).toBeNull();
  });

  it("a malformed issued adjustment returns refused, naming its certificate, not a throw", () => {
    const read = () => positionOf({ original: S("480000.00"), adjustments: [row("A", "20285.00"), row("X", null)], variationBase: "REVISED" });
    expect(read).not.toThrow();
    const p = read();
    expect(p.refused).toEqual({ number: "DEMO/CERT/X", certificateId: "c-X", message: expect.stringContaining("DEMO/CERT/X") });
    expect(p.refused!.message).toContain("are not shown");
    // Nothing read over the issued adjustments: no revised sum, no revised base, no partial list.
    expect(p.revised).toBeNull();
    expect(p.base).toBeNull();
    expect(p.issued).toEqual([]);
  });

  it("refused, the original sum is still the base where the base is the original sum", () => {
    expect(positionOf({ original: S("480000.00"), adjustments: [row("X", null)], variationBase: "ORIGINAL" }).base).toBe(S("480000.00"));
  });

  it("the screens read the position through it, never the throwing reader", () => {
    const src = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");
    expect(src("src/lib/variation/view.ts")).toContain("positionOf({ original, adjustments, variationBase:");
    expect(src("src/lib/variation/view.ts")).not.toContain("issuedAdjustments(");
    const pay = src("src/app/projects/[id]/payment-panels.tsx");
    // The payment view reads the refusal before it assembles the valuation (which reads the issued adjustments).
    expect(pay).toContain("const adjustments = readIssuedAdjustments(p.sumAdjustments);");
    expect(pay).toContain("today && !refused ? await preExecutionFacts(l) : null");
    expect(src("src/app/projects/[id]/variation-panels.tsx")).not.toContain("issuedAdjustments(");
  });
});
