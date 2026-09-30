/**
 * The funding gate (FR-REQ-004, FR-REQ-005).
 *
 * The route is the master gate: required to submit, and what it implies — whether the
 * organisation procures at all, whether its funder supersedes the limits, whether an
 * external authority must be on record first — is read from the configured route,
 * never inferred from its code. The result is snapshotted on the requisition at
 * submission, so a later edit to the route cannot rewrite what it was sent down under.
 */

import { fundingPosture } from "@/lib/reference/vocabulary";
import type { FundingPosture, FundingRoute } from "@/lib/reference/types";

export type FundingRouteRow = FundingRoute & {
  requiresExternalAuthorityRef: boolean;
  externalAuthorityRefLabel: string | null;
};

export type FundingFault =
  | { code: "FUNDING_REQUIRED" }
  | { code: "ROUTE_RETIRED"; route: string }
  | { code: "EXTERNAL_REF_MISSING"; label: string };

export interface FundingGate {
  faults: FundingFault[];
  posture: FundingPosture | null;
  /// False under a route where the organisation does not procure (read by 6.2 on).
  sourcingPermitted: boolean | null;
  supersedesAuthority: boolean | null;
}

export function fundingGate(
  route: FundingRouteRow | null,
  req: { externalAuthorityRef: string | null },
  on: Date,
): FundingGate {
  if (!route) return { faults: [{ code: "FUNDING_REQUIRED" }], posture: null, sourcingPermitted: null, supersedesAuthority: null };
  const faults: FundingFault[] = [];
  if (route.retiredOn != null && route.retiredOn <= on) faults.push({ code: "ROUTE_RETIRED", route: route.nameEn });
  if (route.requiresExternalAuthorityRef && !req.externalAuthorityRef?.trim()) {
    faults.push({
      code: "EXTERNAL_REF_MISSING",
      // The customer's own name for it; where none is set, say what kind of thing it is.
      label: route.externalAuthorityRefLabel?.trim() || "The external authority's reference",
    });
  }
  const posture = fundingPosture(route);
  return {
    faults,
    posture,
    sourcingPermitted: posture !== "RECORDS_ONLY",
    supersedesAuthority: route.supersedesAuthority,
  };
}
