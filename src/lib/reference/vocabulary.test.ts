import { describe, expect, it } from "vitest";

import { TEST_MATRIX } from "@/lib/authority/fixture";

import { CONTRACT_TYPES, FUNDING_ROUTES, SOURCING_METHODS } from "./fixture";
import type { FundingRoute, SourcingMethod } from "./types";
import {
  activeOn,
  assessList,
  assessReferenceData,
  availableInRegime,
  findFundingRoute,
  fundingPosture,
  isUnbanded,
  methodsForValue,
  overridesAuthority,
  runsSourcingExercise,
} from "./vocabulary";

const policy = TEST_MATRIX.policy;
const NOW = new Date("2026-06-01");
const route = (code: string) => findFundingRoute(FUNDING_ROUTES, code) as FundingRoute;
const codes = (ms: SourcingMethod[]) => ms.map((m) => m.code);

describe("funding posture", () => {
  it("treats a route the organisation runs itself as a full procurement", () => {
    expect(fundingPosture(route("inhouse"))).toBe("PROCURES");
    expect(runsSourcingExercise(route("inhouse"))).toBe(true);
  });

  it("separates procuring from choosing how to procure", () => {
    expect(fundingPosture(route("external_route"))).toBe("ROUTE_SET_EXTERNALLY");
    expect(runsSourcingExercise(route("external_route"))).toBe(true);
  });

  it("does not offer a sourcing exercise where the organisation appoints nobody", () => {
    expect(fundingPosture(route("records_only"))).toBe("RECORDS_ONLY");
    expect(runsSourcingExercise(route("records_only"))).toBe(false);
  });

  it("lets not procuring outrank who sets the route", () => {
    const both: FundingRoute = {
      ...route("records_only"),
      routeDecidedExternally: true,
    };
    expect(fundingPosture(both)).toBe("RECORDS_ONLY");
  });
});

describe("authority supersession", () => {
  it("reads the flag rather than the route's name", () => {
    expect(overridesAuthority(route("overridden"))).toBe(true);
    expect(overridesAuthority(route("inhouse"))).toBe(false);
  });

  it("does not supersede on an unknown or absent route", () => {
    expect(overridesAuthority(findFundingRoute(FUNDING_ROUTES, "nonesuch"))).toBe(false);
    expect(overridesAuthority(findFundingRoute(FUNDING_ROUTES, null))).toBe(false);
    expect(overridesAuthority(null)).toBe(false);
  });
});

describe("retirement", () => {
  it("keeps an entry in force up to the day it is retired", () => {
    const before = activeOn(FUNDING_ROUTES, new Date("2025-12-31"));
    expect(before.map((r) => r.code)).toContain("withdrawn");
  });

  it("drops it once retired, without deleting the history", () => {
    expect(activeOn(FUNDING_ROUTES, NOW).map((r) => r.code)).not.toContain("withdrawn");
    expect(FUNDING_ROUTES.some((r) => r.code === "withdrawn")).toBe(true);
  });

  it("returns entries in configured order", () => {
    expect(activeOn(FUNDING_ROUTES, NOW).map((r) => r.sortOrder)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the order it was given where two entries share a sortOrder", () => {
    // The loader breaks a sortOrder tie by name; activeOn must not undo that. Row
    // order on a configuration screen is something the customer signs off, so it
    // cannot depend on which way an unstable sort happened to fall.
    const tied = CONTRACT_TYPES.map((c) => ({ ...c, sortOrder: 1 }));
    expect(activeOn(tied, NOW).map((c) => c.code)).toEqual(CONTRACT_TYPES.map((c) => c.code));
    const reversed = [...tied].reverse();
    expect(activeOn(reversed, NOW).map((c) => c.code)).toEqual(reversed.map((c) => c.code));
  });
});

describe("methods available at a value", () => {
  it("offers only upper-band methods above the tender floor", () => {
    expect(codes(methodsForValue(SOURCING_METHODS, 620_000, policy, NOW))).toEqual([
      "open_high",
      "direct_any",
      "called_off",
    ]);
  });

  it("offers middle-band methods between the floors", () => {
    expect(codes(methodsForValue(SOURCING_METHODS, 120_000, policy, NOW))).toEqual([
      "invited_mid",
      "direct_any",
      "called_off",
    ]);
  });

  it("offers only the any-value methods below the quotation floor", () => {
    expect(codes(methodsForValue(SOURCING_METHODS, 900, policy, NOW))).toEqual([
      "direct_any",
      "called_off",
    ]);
  });

  it("narrows nothing when the value is unknown", () => {
    const all = codes(methodsForValue(SOURCING_METHODS, null, policy, NOW));
    expect(all).toHaveLength(SOURCING_METHODS.length);
  });

  it("lets the customer's boundary switch decide which methods a threshold value gets", () => {
    // The one worked example of a policy choice the product ships rather than settles:
    // exactly on the boundary, `boundaryInclusive` decides which band applies, and the
    // method list has to follow it rather than pick a side of its own.
    const exactly = policy.boundaryValue;

    const lower = codes(methodsForValue(SOURCING_METHODS, exactly, policy, NOW));
    expect(policy.boundaryInclusive).toBe(true);
    expect(lower).toContain("invited_mid");
    expect(lower).not.toContain("open_high");

    const upper = codes(
      methodsForValue(SOURCING_METHODS, exactly, { ...policy, boundaryInclusive: false }, NOW),
    );
    expect(upper).toContain("open_high");
    expect(upper).not.toContain("invited_mid");
  });

  it("never offers a method banded for no regime at all", () => {
    for (const value of [620_000, 120_000, 900]) {
      expect(codes(methodsForValue(SOURCING_METHODS, value, policy, NOW))).not.toContain("unbanded");
    }
  });

  it("surfaces the unbanded method as a configuration fault rather than hiding it", () => {
    const unbanded = SOURCING_METHODS.filter(isUnbanded);
    expect(unbanded.map((m) => m.code)).toEqual(["unbanded"]);
  });

  it("excludes a retired method from every band", () => {
    const retired = SOURCING_METHODS.map((m) =>
      m.code === "direct_any" ? { ...m, retiredOn: new Date("2026-01-01") } : m,
    );
    expect(codes(methodsForValue(retired, 620_000, policy, NOW))).not.toContain("direct_any");
  });
});

describe("regime availability", () => {
  it("answers per regime rather than by value", () => {
    const m = SOURCING_METHODS.find((x) => x.code === "invited_mid") as SourcingMethod;
    expect(availableInRegime(m, "tender")).toBe(false);
    expect(availableInRegime(m, "quotation")).toBe(true);
    expect(availableInRegime(m, "below")).toBe(false);
  });
});

describe("readiness", () => {
  it("reports an empty list as unset, not as a list of zero", () => {
    const empty = assessList([], NOW);
    expect(empty.state).toBe("UNSET");
    expect(empty.active).toBe(0);
    expect(empty.needsSignOff).toBe(false);
  });

  it("counts only entries in force", () => {
    const r = assessList(FUNDING_ROUTES, NOW);
    expect(r.state).toBe("CONFIGURED");
    expect(r.active).toBe(4);
  });

  it("flags a list resting on working defaults", () => {
    const r = assessList(FUNDING_ROUTES, NOW);
    expect(r.assumed).toBe(1);
    expect(r.needsSignOff).toBe(true);
  });

  it("does not call the vocabulary complete while any list is unset", () => {
    const r = assessReferenceData(
      { fundingRoutes: FUNDING_ROUTES, sourcingMethods: SOURCING_METHODS, contractTypes: [] },
      NOW,
    );
    expect(r.contractTypes.state).toBe("UNSET");
    expect(r.complete).toBe(false);
  });

  it("calls it complete only when every list has an entry in force", () => {
    const r = assessReferenceData(
      {
        fundingRoutes: FUNDING_ROUTES,
        sourcingMethods: SOURCING_METHODS,
        contractTypes: CONTRACT_TYPES,
      },
      NOW,
    );
    expect(r.complete).toBe(true);
  });
});
