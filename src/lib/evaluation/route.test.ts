import { describe, expect, it } from "vitest";

import { negotiationRoute } from "./route";
import { NEGOTIATION_DOMAIN } from "./types";

/**
 * FR-EVL-016: the negotiation's route is resolved from the customer's matrix rows on the domain
 * `negotiation`; none shipped, so with no row the route is NO_RULE (refused naming the Approval
 * matrix); a committee step is refused (HAS_COMMITTEE_STEP).
 */

const method = { code: "open_tender", authorityMethodKey: "OT" } as unknown as Parameters<typeof negotiationRoute>[1];
const matrix = (rules: unknown[]) => ({ policy: { boundaryValue: 0, boundaryInclusive: true, currency: "RM" }, roles: { HOD: { nameEn: "Head of Department" } }, rules }) as never;
const ctx = (rules: unknown[]) => ({ dal: matrix(rules), override: null, posture: null }) as unknown as Parameters<typeof negotiationRoute>[0];

describe("the negotiation's route", () => {
  it("no row on the domain: NO_RULE", () => {
    expect(negotiationRoute(ctx([]), method, 1000).routeState).toBe("NO_RULE");
  });
  it("a method with no key: NO_METHOD_KEY", () => {
    expect(negotiationRoute(ctx([]), { ...(method as object), authorityMethodKey: null } as never, 1000).routeState).toBe("NO_METHOD_KEY");
  });
  it("names its domain", () => expect(NEGOTIATION_DOMAIN).toBe("negotiation"));
});
