/**
 * Reference data, and the decisions that hang off it.
 *
 * Pure: every function takes the configured lists and returns an answer. Nothing here
 * reads a database, and nothing here knows a threshold — value bands belong to the
 * authority matrix's policy, and are reached through `regimeFor` rather than restated.
 */

import { regimeFor } from "@/lib/authority/resolve";
import type { Policy, Regime } from "@/lib/authority/types";

import type {
  ContractType,
  FundingPosture,
  FundingRoute,
  ListReadiness,
  Provenance,
  SourcingMethod,
} from "./types";

/// An entry is in force unless it was retired on or before the date asked about.
export function isActive(entry: { retiredOn: Date | null }, on: Date): boolean {
  return entry.retiredOn == null || entry.retiredOn > on;
}

/**
 * The entries in force on a date, in configured order.
 *
 * Sorts on `sortOrder` alone and relies on `Array.prototype.sort` being stable, which
 * preserves whatever secondary order the caller supplied — the loader orders by name
 * within a `sortOrder`, and two entries sharing one must not shuffle between renders.
 * Row order on a configuration screen is something a customer signs off.
 */
export function activeOn<T extends { retiredOn: Date | null; sortOrder: number }>(
  entries: readonly T[],
  on: Date,
): T[] {
  return entries.filter((e) => isActive(e, on)).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * What a funding route means for the work that follows.
 *
 * `organisationProcures` is checked first and wins outright: if the organisation does
 * not appoint anyone, it does not matter who would have chosen the route.
 */
export function fundingPosture(route: FundingRoute): FundingPosture {
  if (!route.organisationProcures) return "RECORDS_ONLY";
  if (route.routeDecidedExternally) return "ROUTE_SET_EXTERNALLY";
  return "PROCURES";
}

/// Whether a matter on this route runs a sourcing exercise of its own at all.
export function runsSourcingExercise(route: FundingRoute): boolean {
  return route.organisationProcures;
}

/**
 * Whether this route's funder overrides the approval matrix.
 *
 * Returns the flag as configured. The engine warns on it rather than re-routing,
 * because the external rule set is not held here and guessing at it would be worse
 * than saying plainly that it applies.
 */
export function overridesAuthority(route: FundingRoute | null | undefined): boolean {
  return route?.supersedesAuthority === true;
}

export function findFundingRoute(
  routes: readonly FundingRoute[],
  code: string | null | undefined,
): FundingRoute | null {
  if (!code) return null;
  return routes.find((r) => r.code === code) ?? null;
}

/// Whether a method may be used in a given regime.
export function availableInRegime(method: SourcingMethod, regime: Regime): boolean {
  if (regime === "tender") return method.availableInTender;
  if (regime === "quotation") return method.availableInQuotation;
  return method.availableBelow;
}

/**
 * The methods open to a matter of this value.
 *
 * A null value narrows nothing — the regime is unknown, so every method in force is
 * still a candidate. Filtering to an empty list there would look like a policy answer
 * when it is only a missing input.
 */
export function methodsForValue(
  methods: readonly SourcingMethod[],
  value: number | null | undefined,
  policy: Policy,
  on: Date,
): SourcingMethod[] {
  const inForce = activeOn(methods, on);
  const regime = regimeFor(value, policy);
  if (regime == null) return inForce;
  return inForce.filter((m) => availableInRegime(m, regime));
}

/**
 * Whether a method is banded for no regime at all.
 *
 * Not an error the system may correct: a method available nowhere is a configuration
 * mistake only the customer can resolve, and it shows on the screen as one.
 */
export function isUnbanded(method: SourcingMethod): boolean {
  return !method.availableInTender && !method.availableInQuotation && !method.availableBelow;
}

/// Assess a list the way quorum is assessed: unset is its own answer.
export function assessList(
  entries: readonly { provenance: Provenance; retiredOn: Date | null; sortOrder: number }[],
  on: Date,
): ListReadiness {
  const inForce = activeOn(entries, on);
  const assumed = inForce.filter((e) => e.provenance === "ASSUMED").length;
  return {
    state: inForce.length === 0 ? "UNSET" : "CONFIGURED",
    active: inForce.length,
    assumed,
    needsSignOff: assumed > 0,
  };
}

export interface ReferenceReadiness {
  fundingRoutes: ListReadiness;
  sourcingMethods: ListReadiness;
  contractTypes: ListReadiness;
  /// True where every list has at least one entry in force. Until then the vocabulary
  /// the approval engine routes on is incomplete, and a matter cannot be classified.
  complete: boolean;
}

export function assessReferenceData(
  data: {
    fundingRoutes: readonly FundingRoute[];
    sourcingMethods: readonly SourcingMethod[];
    contractTypes: readonly ContractType[];
  },
  on: Date,
): ReferenceReadiness {
  const fundingRoutes = assessList(data.fundingRoutes, on);
  const sourcingMethods = assessList(data.sourcingMethods, on);
  const contractTypes = assessList(data.contractTypes, on);
  return {
    fundingRoutes,
    sourcingMethods,
    contractTypes,
    complete:
      fundingRoutes.state === "CONFIGURED" &&
      sourcingMethods.state === "CONFIGURED" &&
      contractTypes.state === "CONFIGURED",
  };
}
