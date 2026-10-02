import { describe, expect, it } from "vitest";

import { NEGOTIATION_DOMAIN } from "@/lib/evaluation/types";

import { exerciseRouteMatter, exerciseRoutesOf, historyFieldHidden, historyRouteLabel, routesByDomain } from "./approval";

/**
 * 6.8 (X-5, flagged against the method module as 6.4 and 6.5 extended it, new tests): the negotiation's
 * route (FR-EVL-016) is the exercise's own, split by the one splitter, named in words, opened from the
 * Evaluation tab; cancelling the exercise withdraws it with the others (exerciseRoutesOf).
 */

const r = (id: string, domain: string, awardId: string | null = null) => ({ id, domain, awardId, status: "PENDING" });

describe("the negotiation's route is the exercise's own", () => {
  it("is split under its domain, never an award's", () => {
    expect(routesByDomain([r("g1", NEGOTIATION_DOMAIN)])[NEGOTIATION_DOMAIN].map((x) => x.id)).toEqual(["g1"]);
    expect(exerciseRoutesOf([r("g1", NEGOTIATION_DOMAIN), r("g2", NEGOTIATION_DOMAIN, "award1")]).map((x) => x.id)).toEqual(["g1"]);
  });
  it("reads as words and opens the Evaluation tab", () => {
    expect(exerciseRouteMatter(NEGOTIATION_DOMAIN)).toEqual({ kind: "Negotiation with a tenderer", tab: "evaluation", auditNoun: "negotiation" });
    expect(historyRouteLabel(NEGOTIATION_DOMAIN, "route")).toBe("Approval of a negotiation");
    expect(historyRouteLabel(NEGOTIATION_DOMAIN, "step")).toBe("Step of the approval of a negotiation");
    expect(historyFieldHidden(NEGOTIATION_DOMAIN, "fundingOverrideApplied")).toBe(true);
  });
});
