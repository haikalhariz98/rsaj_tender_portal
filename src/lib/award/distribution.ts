/**
 * Who receives a copy of the instrument, and how it went (FR-AWD-004, FR-AWD-005).
 *
 * The recipients are the customer's list for the instrument, shipped empty. A
 * recipient that applies only to the regulated activity is on the list where the award
 * says the works are that activity; while nobody has answered, the list cannot be drawn
 * (6.11 ruling). The awardee's own copy is a row on the same log. A copy sent by
 * registered post needs its consignment reference; a collection records the day it
 * was collected. Distribution is complete when every mandatory copy has gone.
 */

import type { DeliveryMethod, InstrumentKind } from "./types";

export interface Recipient {
  id: string;
  instrumentKind: InstrumentKind;
  nameEn: string;
  mandatory: boolean;
  onlyWhenRegulated: boolean;
  sortOrder: number;
  retiredOn: Date | null;
}

export interface CopyRow {
  recipientId: string | null;
  recipientName: string;
  mandatory: boolean;
  isAwardee: boolean;
  sortOrder: number;
}

export type ListFault = "RECIPIENTS_NOT_SET" | "REGULATED_NOT_ANSWERED";

export function distributionList(
  recipients: readonly Recipient[],
  kind: InstrumentKind,
  regulated: boolean | null,
  awardeeName: string,
  on?: Date,
): { rows: CopyRow[] } | { fault: ListFault } {
  const live = recipients.filter((r) => r.instrumentKind === kind && (r.retiredOn == null || (on != null && r.retiredOn > on))).sort((a, b) => a.sortOrder - b.sortOrder);
  if (live.length === 0) return { fault: "RECIPIENTS_NOT_SET" };
  if (regulated == null && live.some((r) => r.onlyWhenRegulated)) return { fault: "REGULATED_NOT_ANSWERED" };
  const rows: CopyRow[] = live
    .filter((r) => !r.onlyWhenRegulated || regulated === true)
    .map((r, i) => ({ recipientId: r.id, recipientName: r.nameEn, mandatory: r.mandatory, isAwardee: false, sortOrder: i + 1 }));
  return { rows: [{ recipientId: null, recipientName: awardeeName, mandatory: true, isAwardee: true, sortOrder: 0 }, ...rows] };
}

export type DespatchFault = "METHOD_REQUIRED" | "DATE_REQUIRED" | "CONSIGNMENT_REQUIRED" | "FUTURE_DATE" | "ACK_BEFORE_DESPATCH" | "BEFORE_ISSUE";

export function despatchFaults(
  d: { method: DeliveryMethod | null; consignmentRef: string; despatchedOn: string | null; acknowledgedOn: string | null },
  ctx: { today: string; issuedOn: string },
): DespatchFault[] {
  const out: DespatchFault[] = [];
  if (!d.method) out.push("METHOD_REQUIRED");
  if (!d.despatchedOn) out.push("DATE_REQUIRED");
  if (d.method === "REGISTERED_POST" && !d.consignmentRef.trim()) out.push("CONSIGNMENT_REQUIRED");
  if ((d.despatchedOn && d.despatchedOn > ctx.today) || (d.acknowledgedOn && d.acknowledgedOn > ctx.today)) out.push("FUTURE_DATE");
  if (d.despatchedOn && d.despatchedOn < ctx.issuedOn) out.push("BEFORE_ISSUE");
  if (d.acknowledgedOn && (!d.despatchedOn || d.acknowledgedOn < d.despatchedOn)) out.push("ACK_BEFORE_DESPATCH");
  return out;
}

export function distributionComplete(rows: readonly { mandatory: boolean; despatchedOn: unknown }[]): { complete: boolean; outstanding: number; sent: number; total: number } {
  const outstanding = rows.filter((r) => r.mandatory && !r.despatchedOn).length;
  return { complete: rows.length > 0 && outstanding === 0, outstanding, sent: rows.filter((r) => !!r.despatchedOn).length, total: rows.length };
}
