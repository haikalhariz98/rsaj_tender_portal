/**
 * What the Time tab's loss-and-expense and contract period cards offer, and the state each row reads (close-out stage A review: the tab restated
 * these rules inline). Pure: each takes the row as loaded and decides; the panel renders what it is given.
 */

import { matterApproved, type ContractMatterKind } from "@/lib/matter/matter";

type Route = { id: string; status: string };
type Matter = { kind: string; reference: string | null; closedAt: Date | null; closeReason?: string | null; approvedRouteId: string | null; routes: readonly Route[] };

const approved = (m: Matter): boolean => matterApproved({ kind: m.kind as ContractMatterKind, reference: m.reference, closed: m.closedAt ? { reason: m.closeReason ?? "" } : null, seriesSet: true, routes: m.routes, approvedRouteId: m.approvedRouteId });
const waiting = (m: Matter): boolean => m.routes.at(-1)?.status === "PENDING";

export interface LossRow {
  matterId: string | null;
  valued: unknown;
  matter: Matter | null;
}

export type LossState = "Recorded" | "Valued" | "Awaiting approval" | "Approved" | "Refused" | "Closed";

/// A loss-and-expense claim's state in words: its matter's approval of record is `matterApproved`'s, as everywhere else.
export function lossStateOf(x: LossRow): LossState {
  if (!x.matter) return x.valued == null ? "Recorded" : "Valued";
  if (x.matter.closedAt) return "Closed";
  if (approved(x.matter)) return "Approved";
  const latest = x.matter.routes.at(-1);
  return latest?.status === "PENDING" ? "Awaiting approval" : latest ? "Refused" : "Valued";
}

/// Valued only before it is sent (its value stands as sent).
export const lossValuable = (x: LossRow): boolean => !x.matterId;
/// Sent once valued, and again after a refusal; never while waiting, once approved or once closed.
export const lossSendable = (x: LossRow): boolean => x.valued != null && (!x.matter || (!x.matter.closedAt && !waiting(x.matter) && !approved(x.matter)));

export interface PeriodRow {
  m: Matter;
  approved: boolean;
  x: { agreements: readonly { certificate: { status: string } }[] };
}

export type PeriodState = "Agreed" | "Agreement raised" | "Approved" | "Closed" | "Awaiting approval" | "Recorded";

/// An extension of the contract period's state in words: its live agreement first, then its matter.
export function periodStateOf(p: PeriodRow): PeriodState {
  const agreement = p.x.agreements.find((a) => a.certificate.status !== "VOID");
  if (agreement) return agreement.certificate.status === "ISSUED" ? "Agreed" : "Agreement raised";
  if (p.approved) return "Approved";
  if (p.m.closedAt) return "Closed";
  return waiting(p.m) ? "Awaiting approval" : "Recorded";
}

/// Sent for approval while not approved, not closed and not waiting.
export const periodSendable = (p: PeriodRow): boolean => !p.approved && !p.m.closedAt && !waiting(p.m);
/// Its agreement is raised once approved, and only while none is live.
export const periodAgreeable = (p: PeriodRow): boolean => p.approved && !p.x.agreements.some((a) => a.certificate.status !== "VOID");
