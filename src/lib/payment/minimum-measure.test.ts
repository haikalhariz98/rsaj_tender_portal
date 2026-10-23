import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { minimumMeasureText } from "./minimum";
import { paymentFaultText } from "./labels";

/// BD-613-29 (approved with condition) and BD-613-32 (code review run 2 rulings).
describe("the minimum's measure is said, and said to be assumed", () => {
  const fmt = (v: bigint) => `RM${v.toString()}`;
  it("the first certificate on its gross; a later one on the amount carried forward", () => {
    expect(minimumMeasureText(true, parseSen("1700.00"), fmt).en).toMatch(/^Minimum RM170000: the first interim certificate is judged on its gross value to date \(an assumed reading: the sources state no measure\)\.$/);
    expect(minimumMeasureText(false, parseSen("1000.00"), fmt).en).toMatch(/a later interim certificate is judged on the amount it carries forward \(an assumed reading/);
    expect(minimumMeasureText(false, null, fmt).en).toMatch(/^Minimum not set:/);
  });
  it("the certificate carries the line; Configuration › Post-award says it, flagged ASSUMED, in a popover", () => {
    const ROOT = path.join(__dirname, "../../..");
    expect(readFileSync(path.join(ROOT, "src/lib/payment/assemble.ts"), "utf8")).toMatch(/key: "minimumMeasure"/);
    const cfg = readFileSync(path.join(ROOT, "src/app/configuration/post-award/page.tsx"), "utf8");
    expect(cfg).toMatch(/MINIMUM_MEASURE_WORDS\.first\.en/);
    expect(cfg).toMatch(/The certificate's minimum[^]*?source="ASSUMED"/);
  });
});

describe("certificates before signing: a limit of none never reads as 0 (BD-613-32)", () => {
  it("limit 0 says none may be; unset says not set", () => {
    const t = paymentFaultText({ code: "CONTRACT_NOT_SIGNED", level: "block", data: { sequence: 1, limit: 0 } });
    expect(t).toMatch(/none may be/);
    expect(t).not.toMatch(/\b0\b/);
    expect(paymentFaultText({ code: "PRE_EXECUTION_LIMIT_NOT_SET", level: "warn", data: {} })).toMatch(/not set/);
  });
});
