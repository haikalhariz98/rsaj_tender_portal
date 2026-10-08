/**
 * Who may not decide a route because the matter is theirs (FR-APR-008): the one answer, per kind of route, that the decision rules and the worklist both read.
 *
 * The decision rules (`deciderFaults`, "SELF_APPROVAL") bar one person, and which one depends on the route:
 * - a requisition's route, the name's route and the appointment's: the officer who raised the requisition behind them;
 * - a certificate's, a variation's and a contract matter's: whoever sent the route for approval;
 * - a supplier's registration: whoever sent the application;
 * - a blacklisting (or its lifting) and a special permission: whoever raised the request.
 *
 * The sender of a name or an appointment route is barred as well (product owner, 2026-10-08, ruling on log line 1789): one separation rule across every kind of route, as
 * the sender already is on a certificate's, a variation's and a contract matter's. So those two kinds bar TWO people, the officer who raised the requisition and whoever sent
 * the route: `routeRequesterId` is the first (what `deciderFaults` reads as `requesterId`), `routeSenderBarredId` the second (`senderId`), and `routeBarred` both, each with how
 * the person is related to the matter, for the worklist. The decision sites and the worklist read these same helpers, so the screen and the server cannot disagree.
 *
 * Pure.
 */

export type RequesterRouteKind =
  | "REQUISITION"
  | "NAME_APPROVAL"
  | "APPOINTMENT"
  | "CERTIFICATE"
  | "VARIATION"
  | "CONTRACT_MATTER"
  | "SUPPLIER_APPLICATION"
  | "STANDING_REQUEST"
  | "SPECIAL_PERMISSION";

/// Where the barred person is recorded, whichever route it is.
export interface RequesterFacts {
  /// The requisition's requesting officer.
  requisitionRaiserId?: string | null;
  /// The person recorded on the route as having sent it.
  routeSenderId?: string | null;
  /// The person recorded on the supplier's application as having sent it.
  applicationSenderId?: string | null;
  /// The person recorded on the blacklisting request or the special permission as having requested it.
  requestRaiserId?: string | null;
}

type Source = keyof RequesterFacts;

const SOURCE: Readonly<Record<RequesterRouteKind, Source>> = {
  REQUISITION: "requisitionRaiserId",
  NAME_APPROVAL: "requisitionRaiserId",
  APPOINTMENT: "requisitionRaiserId",
  CERTIFICATE: "routeSenderId",
  VARIATION: "routeSenderId",
  CONTRACT_MATTER: "routeSenderId",
  SUPPLIER_APPLICATION: "applicationSenderId",
  STANDING_REQUEST: "requestRaiserId",
  SPECIAL_PERMISSION: "requestRaiserId",
};

/// The person who may not decide a route of this kind, or null where none is recorded.
export function routeRequesterId(kind: RequesterRouteKind, facts: RequesterFacts): string | null {
  return facts[SOURCE[kind]] ?? null;
}

/// The person who sent a name or an appointment route, who may not decide it either (ruling on log line 1789); null for every other kind, whose one barred person is `routeRequesterId`.
export function routeSenderBarredId(kind: RequesterRouteKind, facts: RequesterFacts): string | null {
  return kind === "NAME_APPROVAL" || kind === "APPOINTMENT" ? (facts.routeSenderId ?? null) : null;
}

/// How the barred person is related to the matter, for the words on the worklist: they raised it, they sent it, or they keyed an earlier act of it for someone else.
export type BarredRelation = "RAISED" | "SENT" | "KEYED";

/// How the person `routeRequesterId` names is related to the matter: they raised it, or they sent it.
export function requesterRelation(kind: RequesterRouteKind): "RAISED" | "SENT" {
  return SOURCE[kind] === "routeSenderId" || SOURCE[kind] === "applicationSenderId" ? "SENT" : "RAISED";
}

/// Everyone a route of this kind bars, each with how they are related to it. A person who is both the raiser and the sender is listed once, as the raiser.
export function routeBarred(kind: RequesterRouteKind, facts: RequesterFacts): { personId: string; relation: BarredRelation }[] {
  const out: { personId: string; relation: BarredRelation }[] = [];
  const first = routeRequesterId(kind, facts);
  if (first) out.push({ personId: first, relation: requesterRelation(kind) });
  const sender = routeSenderBarredId(kind, facts);
  if (sender && sender !== first) out.push({ personId: sender, relation: "SENT" });
  return out;
}

export const BARRED_WORDS: Readonly<Record<BarredRelation, string>> = {
  RAISED: "You raised it: you cannot decide it",
  SENT: "You sent it: you cannot decide it",
  // Ruling on log line 1792: the officer who keyed the requisition, an endorsement or an earlier step for someone else is its author as much as the colleague is.
  KEYED: "You recorded it for someone else: you cannot decide it",
};
