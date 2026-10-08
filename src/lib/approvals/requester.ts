/**
 * Who may not decide a route because the matter is theirs (FR-APR-008): the one answer, per kind of route, that the decision rules and the worklist both read.
 *
 * The decision rules (`deciderFaults`, "SELF_APPROVAL") bar one person, and which one depends on the route:
 * - a requisition's route, the name's route and the appointment's: the officer who raised the requisition behind them;
 * - a certificate's, a variation's and a contract matter's: whoever sent the route for approval;
 * - a supplier's registration: whoever sent the application;
 * - a blacklisting (or its lifting) and a special permission: whoever raised the request.
 *
 * Whether the sender of a name or an appointment route should be barred as well is a question for the product owner (decisions log, Phase 3c review): until it is
 * ruled, nobody is shown as barred whom the server does not bar, and `submittedByPersonId` on those routes is the originator for recall only.
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

/// How the barred person is related to the matter, for the words on the worklist: they raised it, or they sent it.
export function requesterRelation(kind: RequesterRouteKind): "RAISED" | "SENT" {
  return SOURCE[kind] === "routeSenderId" || SOURCE[kind] === "applicationSenderId" ? "SENT" : "RAISED";
}

export const BARRED_WORDS: Readonly<Record<"RAISED" | "SENT", string>> = {
  RAISED: "You raised it: you cannot decide it",
  SENT: "You sent it: you cannot decide it",
};
