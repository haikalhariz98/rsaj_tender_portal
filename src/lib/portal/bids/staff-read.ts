import type { Tx } from "@/lib/audit/record";
import { formatOrgDateTime } from "@/lib/format";

import { requestState, type RequestState } from "./checks";

/**
 * What the officers' screens show of the supplier-side records of My Bids (Phase 4d): who signed up online for an event, who acknowledged an addendum online, what documents were asked for and what became of
 * it, and who opened the Tender Table Document. Reads only, for the organisation's own rows; each is labelled by the supplier's register reference and registered name. None of it is attendance or delivery:
 * the officer's attendance register and the recorded delivery of a copy stay what they were, and the screens say so beside these.
 */

const who = (s: { reference: string; registeredName: string }) => `${s.reference} · ${s.registeredName}`;

export interface SignUpRow {
  supplier: string;
  representative: string;
  /// When the supplier signed up, as the organisation reads it.
  at: string;
  /// The supplier withdrew, when.
  withdrawn: string | null;
}

export async function signUpsByEvent(client: Tx, organisationId: string, eventIds: readonly string[], timeZone: string | null): Promise<Map<string, SignUpRow[]>> {
  const out = new Map<string, SignUpRow[]>();
  if (eventIds.length === 0) return out;
  const rows = await client.siteEventRegistration.findMany({
    where: { organisationId, eventId: { in: [...eventIds] } },
    orderBy: [{ registeredAt: "asc" }, { id: "asc" }],
    select: { eventId: true, representative: true, registeredAt: true, endedAt: true, supplier: { select: { reference: true, registeredName: true } } },
  });
  for (const r of rows) {
    const list = out.get(r.eventId) ?? [];
    list.push({ supplier: who(r.supplier), representative: r.representative, at: formatOrgDateTime(r.registeredAt, timeZone), withdrawn: r.endedAt ? formatOrgDateTime(r.endedAt, timeZone) : null });
    out.set(r.eventId, list);
  }
  return out;
}

export interface AcknowledgementRow {
  supplier: string;
  at: string;
}

export async function acknowledgementsByAddendum(client: Tx, organisationId: string, addendumIds: readonly string[], timeZone: string | null): Promise<Map<string, AcknowledgementRow[]>> {
  const out = new Map<string, AcknowledgementRow[]>();
  if (addendumIds.length === 0) return out;
  const rows = await client.addendumAcknowledgement.findMany({
    where: { organisationId, addendumId: { in: [...addendumIds] } },
    orderBy: [{ acknowledgedAt: "asc" }, { id: "asc" }],
    select: { addendumId: true, acknowledgedAt: true, supplier: { select: { reference: true, registeredName: true } } },
  });
  for (const r of rows) {
    const list = out.get(r.addendumId) ?? [];
    list.push({ supplier: who(r.supplier), at: formatOrgDateTime(r.acknowledgedAt, timeZone) });
    out.set(r.addendumId, list);
  }
  return out;
}

export const REQUEST_STATE_WORDS: Record<RequestState, string> = {
  WAITING: "Waiting for an officer to record the sale",
  BOUGHT: "Sold",
  WITHDRAWN: "Withdrawn by the supplier",
  REFUSED: "Refused by the pre-sale checks",
};

export interface RequestRow {
  id: string;
  /// When it was asked, as an instant, for sorting.
  sort: string;
  supplier: string;
  /// The supplier's register id, so the sale form can name it (an officer chooses the supplier there).
  supplierId: string;
  collector: string;
  at: string;
  state: RequestState;
  /// For a refused attempt: the reasons the checks gave.
  reasons: string[];
}

export async function requestsOfWindow(client: Tx, organisationId: string, windowId: string, timeZone: string | null): Promise<RequestRow[]> {
  const rows = await client.documentRequest.findMany({
    where: { organisationId, windowId },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    select: { id: true, collectorName: true, requestedAt: true, refusedAt: true, endedAt: true, checks: true, supplierId: true, supplier: { select: { reference: true, registeredName: true } } },
  });
  if (rows.length === 0) return [];
  // Fulfilled by a sale that stands to a party linked to the supplier: the request itself never makes one.
  const sold = await client.documentSale.findMany({ where: { organisationId, windowId, voidedAt: null, party: { vendorId: { in: [...new Set(rows.map((r) => r.supplierId))] } } }, select: { party: { select: { vendorId: true } } } });
  const bought = new Set(sold.map((s) => s.party.vendorId));
  return rows.map((r) => ({
    id: r.id,
    supplier: who(r.supplier),
    supplierId: r.supplierId,
    collector: r.collectorName,
    at: formatOrgDateTime(r.requestedAt, timeZone),
    sort: r.requestedAt.toISOString(),
    state: requestState(r, bought.has(r.supplierId)),
    reasons: r.refusedAt ? ((r.checks as unknown as { state: string; detail: string }[]) ?? []).filter((c) => c.state === "BLOCK").map((c) => c.detail) : [],
  }));
}

export interface InspectionLog {
  total: number;
  suppliers: number;
  /// Every opening, newest first. The list pages and searches them; nothing is cut off at a count.
  rows: { id: string; supplier: string; kind: string; version: number; at: string; sort: string }[];
}

export async function inspectionLogOf(client: Tx, organisationId: string, windowId: string, timeZone: string | null): Promise<InspectionLog> {
  const where = { organisationId, windowId };
  const [total, bySupplier, rows] = await Promise.all([
    client.tenderInspectionEvent.count({ where }),
    client.tenderInspectionEvent.groupBy({ by: ["supplierId"], where }),
    client.tenderInspectionEvent.findMany({ where, orderBy: [{ viewedAt: "desc" }, { id: "desc" }], select: { id: true, kind: true, documentVersion: true, viewedAt: true, supplier: { select: { reference: true, registeredName: true } } } }),
  ]);
  return {
    total,
    suppliers: bySupplier.length,
    rows: rows.map((r) => ({ id: r.id, supplier: who(r.supplier), kind: r.kind === "PACK" ? "The released documents" : "The Tender Table Document", version: r.documentVersion, at: formatOrgDateTime(r.viewedAt, timeZone), sort: r.viewedAt.toISOString() })),
  };
}
