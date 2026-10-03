import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { ladRoundingFaults } from "./interim";

/// BD-613-47 (ruled): −RM1.00 < rounding < RM1.00, and damages + rounding ≥ 0. The worked example: +0.20 brings
/// 2,693.80 to 2,694.00.
const s = parseSen;
const codes = (d: string, r: string) => ladRoundingFaults(s(d), s(r)).map((f) => f.code);

describe("the rounding on the damages line", () => {
  it("the worked example: +0.20 on 2,693.80", () => expect(codes("2693.80", "0.20")).toEqual([]));
  it("±0.99 accepted; ±1.00 refused", () => {
    expect(codes("2693.80", "0.99")).toEqual([]);
    expect(codes("2693.80", "-0.99")).toEqual([]);
    expect(codes("2693.80", "1.00")).toEqual(["LAD_ROUNDING_OUT_OF_RANGE"]);
    expect(codes("2693.80", "-1.00")).toEqual(["LAD_ROUNDING_OUT_OF_RANGE"]);
  });
  it("never takes the damages below nothing", () => {
    expect(codes("0.50", "-0.50")).toEqual([]);
    expect(codes("0.50", "-0.51")).toEqual(["LAD_ROUNDING_BELOW_NOTHING"]);
  });
  it("the migration's CHECK holds the same range", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("prisma/migrations/20261003300300_lad_rounding_range/migration.sql", "utf8");
    expect(sql).toMatch(/CHECK \("kind" <> 'LAD_ROUNDING' OR \("amount" > -1 AND "amount" < 1\)\)/);
    expect(sql).toMatch(/Pre-check failed/);
  });
});
