import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RECOMMENDATION_ZONE_UNSET } from "./labels";

/**
 * 66-C1 (b): attaching the absent holder's recommendation to a delegation judged whether the
 * delegation had ended on the UTC day when the organisation's time zone was unset. It now refuses,
 * in the "time zone not set" wording used elsewhere (people/end-assignment.ts).
 */
describe("attaching a delegation's recommendation with no time zone set (66-C1 b)", () => {
  const src = readFileSync("src/app/configuration/users/core.ts", "utf8");
  const body = src.slice(src.indexOf("async function attachRecommendation("));
  const fn = body.slice(0, body.indexOf("\n}\n") + 2);

  it("the refusal says the time zone is not set, where to set it, and what to do then", () => {
    expect(RECOMMENDATION_ZONE_UNSET).toMatch(/^The organisation's time zone is not set, so today cannot be told/);
    expect(RECOMMENDATION_ZONE_UNSET).toMatch(/Configuration › Organisation, then attach the recommendation\.$/);
  });
  it("never falls back to the UTC day", () => {
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
    expect(fn).not.toMatch(/storedDay\(new Date\(\)\)/);
  });
  it("refuses before judging, and judges the delegation on the organisation's today", () => {
    expect(fn).toMatch(/const today = todayIn\(new Date\(\), /);
    expect(fn).toMatch(/if \(!today\) throw new RecommendationRefused\(RECOMMENDATION_ZONE_UNSET\);/);
    expect(fn.indexOf("if (!today)")).toBeLessThan(fn.indexOf("attachFault("));
    expect(fn).toMatch(/delegationFacts\(d, today\)/);
  });
  it("the refusal reaches the form beside the recommendation, as the other refusals do", () => {
    expect(src).toMatch(/if \(e instanceof RecommendationRefused\) return \{ ok: false, errors: \{ recommendationVersionId: e\.message \} \};/);
  });
});
