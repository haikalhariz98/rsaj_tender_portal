/**
 * The negotiation's route (FR-EVL-016; 6.5 OD-5 precedent): the engine's route on the domain
 * `negotiation`, under the method's key, at the exercise's value, resolved from the customer's matrix
 * (no row shipped, none named here). No rule: refused, naming the Approval matrix. A committee step is
 * refused as the window change's is (BD-65-6): a committee decides the appointment, and no sitting
 * tables a negotiation. Self-approval escalates or refuses (FR-APR-008). Pure.
 */

import { exerciseRoutePreview, withRequester, type AppointmentPreview, type FunderContext, type RequesterOnName } from "@/lib/method/approval";
import type { Method } from "@/lib/method/types";

import { NEGOTIATION_DOMAIN } from "./types";

export type NegotiationRouteState = "NO_METHOD_KEY" | "NO_RULE" | "HAS_COMMITTEE_STEP" | "RESOLVED";

export function negotiationRoute(ctx: FunderContext, method: Method, value: number): AppointmentPreview & { routeState: NegotiationRouteState } {
  const p = exerciseRoutePreview(ctx, NEGOTIATION_DOMAIN, method, value);
  if (p.state === "NO_METHOD_KEY") return { ...p, routeState: "NO_METHOD_KEY" };
  if (p.state !== "RESOLVED") return { ...p, routeState: "NO_RULE" };
  return { ...p, routeState: p.chain.some((s) => s.committeeCode) ? "HAS_COMMITTEE_STEP" : "RESOLVED" };
}

export function negotiationRouteForRequester(ctx: FunderContext, method: Method, value: number, requester: RequesterOnName): AppointmentPreview & { routeState: NegotiationRouteState; refusal: string | null } {
  const r = negotiationRoute(ctx, method, value);
  if (r.routeState !== "RESOLVED") return { ...r, refusal: null };
  const w = withRequester(ctx, NEGOTIATION_DOMAIN, method, value, r, requester, "a negotiation");
  return { ...r, ...w, routeState: w.chain.some((s) => s.committeeCode) ? "HAS_COMMITTEE_STEP" : "RESOLVED" };
}

/// Where a refused negotiation goes: nowhere; it is not held, and may be asked for again.
export const NEGOTIATION_REFUSED_DECIDED_BY = "the negotiation is not held, and may be asked for again";
