/**
 * Addenda and corrigenda during the window (FR-ADV-014; FR-ADV-012 the register as the list).
 *
 * An addendum is drafted with what changed, its signed copy is attached (document store, purpose
 * ADDENDUM_SIGNED), and it is issued under the window's lock: numbered then, one after the last
 * issued (a voided draft never takes a number, so the issued ones run 1, 2, 3 with no gap), its
 * text frozen from the configured template (ADR 0008), and its recipients taken from the register
 * as it stands — every party holding a live sale, and on the invited path every invitee whose
 * letter was issued. A later purchaser receives it with the documents. Delivery is recorded per
 * recipient, never sent (INT-09 is not built); it is notified to everyone only when every
 * recipient's copy is recorded as despatched or given. Pure.
 */

import { fieldsInWords } from "./fields";
import type { WindowPhase } from "./phase";
import type { Finding } from "./types";

/// The next number: one after the last issued.
export const nextAddendumNumber = (addenda: readonly { status: string; number: number | null }[]): number => addenda.filter((a) => a.status === "ISSUED" && a.number != null).reduce((n, a) => Math.max(n, a.number!), 0) + 1;

export type AddendumFault =
  | "NOT_DRAFT"
  | "NOT_PUBLISHED"
  | "AFTER_CLOSING"
  | "EXERCISE_CANCELLED"
  | "TITLE_REQUIRED"
  | "WHAT_CHANGED_REQUIRED"
  | "SIGNED_COPY_REQUIRED"
  | "TEMPLATE_NOT_SET"
  | "TEMPLATE_TEXT_NOT_SET"
  | "TEMPLATE_INCOMPLETE"
  | "TEMPLATE_UNKNOWN_FIELD"
  | "STAMP_NOT_SET"
  | "TIME_ZONE_UNSET"
  | "NO_RECIPIENTS";

/// Whether an addendum may be drafted or edited now: during the published window, before closing.
export function addendumWindowFault(phase: WindowPhase): Finding<AddendumFault> | null {
  if (phase === "CANCELLED") return { code: "EXERCISE_CANCELLED", level: "block" };
  if (phase === "NOT_PUBLISHED") return { code: "NOT_PUBLISHED", level: "block" };
  if (phase === "CLOSED" || phase === "UNKNOWN") return { code: "AFTER_CLOSING", level: "block", data: { phase } };
  return null;
}

export function issueFaults(i: {
  status: string;
  phase: WindowPhase;
  title: string;
  whatChanged: string;
  /// Live ADDENDUM_SIGNED attachments.
  signedCopies: number;
  template: { state: "NOT_SET" | "NO_TEXT" | "OK"; missing: readonly string[]; unknown: readonly string[]; stampMissing?: boolean };
  recipients: number;
  today: string | null;
}): Finding<AddendumFault>[] {
  const out: Finding<AddendumFault>[] = [];
  if (i.status !== "DRAFT") return [{ code: "NOT_DRAFT", level: "block" }];
  if (!i.today) out.push({ code: "TIME_ZONE_UNSET", level: "block" });
  const w = addendumWindowFault(i.phase);
  if (w) out.push(w);
  if (!i.title.trim()) out.push({ code: "TITLE_REQUIRED", level: "block" });
  if (!i.whatChanged.trim()) out.push({ code: "WHAT_CHANGED_REQUIRED", level: "block" });
  if (i.signedCopies < 1) out.push({ code: "SIGNED_COPY_REQUIRED", level: "block" });
  if (i.template.state === "NOT_SET") out.push({ code: "TEMPLATE_NOT_SET", level: "block", data: { instrument: "ADDENDUM" } });
  else if (i.template.state === "NO_TEXT") out.push({ code: "TEMPLATE_TEXT_NOT_SET", level: "block", data: { instrument: "ADDENDUM" } });
  else {
    if (i.template.unknown.length) out.push({ code: "TEMPLATE_UNKNOWN_FIELD", level: "block", data: { fields: fieldsInWords("ADDENDUM", i.template.unknown) } });
    if (i.template.missing.length) out.push({ code: "TEMPLATE_INCOMPLETE", level: "block", data: { fields: fieldsInWords("ADDENDUM", i.template.missing) } });
    // FR-DOC-009: a restricted exercise's addendum carries the configured stamp, in its language.
    if (i.template.stampMissing) out.push({ code: "STAMP_NOT_SET", level: "block" });
  }
  // Issued with nobody to notify is allowed, and says so.
  if (i.recipients === 0) out.push({ code: "NO_RECIPIENTS", level: "info" });
  return out;
}

/**
 * Who receives an addendum issued now (FR-ADV-012): every party with a live sale, and on the
 * invited path every invitee whose letter was issued; each once, in the order first recorded.
 */
export function recipientsFor(sales: readonly { partyId: string; voidedAt: Date | null }[], invitees: readonly { partyId: string }[] = []): string[] {
  const out: string[] = [];
  for (const id of [...sales.filter((s) => !s.voidedAt).map((s) => s.partyId), ...invitees.map((i) => i.partyId)]) if (!out.includes(id)) out.push(id);
  return out;
}

/// The issued addenda a new purchaser receives with the documents.
export const addendaForNewPurchaser = <A extends { status: string; id: string }>(addenda: readonly A[]): A[] => addenda.filter((a) => a.status === "ISSUED");

export type NotifiedState = "NO_RECIPIENTS" | "COMPLETE" | "OUTSTANDING";

/// Notified to everyone only when every recipient's copy is despatched or given (100%).
export function notified(recipients: readonly { despatchedOn: Date | null; withDocuments: boolean }[]): { state: NotifiedState; done: number; of: number } {
  const of = recipients.length;
  const done = recipients.filter((r) => r.withDocuments || r.despatchedOn != null).length;
  return { state: of === 0 ? "NO_RECIPIENTS" : done === of ? "COMPLETE" : "OUTSTANDING", done, of };
}

export type DeliveryFault = "METHOD_REQUIRED" | "DESPATCH_IN_FUTURE" | "ACK_BEFORE_DESPATCH" | "ACK_IN_FUTURE" | "TIME_ZONE_UNSET" | "WITH_DOCUMENTS";

/// Recording a copy's delivery: how, when despatched (not after today) and, optionally, acknowledged (not before despatch).
export function deliveryFaults(d: { method: string | null; despatchedOn: string | null; acknowledgedOn: string | null; withDocuments?: boolean }, today: string | null): Finding<DeliveryFault>[] {
  const out: Finding<DeliveryFault>[] = [];
  if (!today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (d.withDocuments) return [{ code: "WITH_DOCUMENTS", level: "block" }];
  if (d.despatchedOn && !d.method) out.push({ code: "METHOD_REQUIRED", level: "block" });
  if (d.despatchedOn && d.despatchedOn > today) out.push({ code: "DESPATCH_IN_FUTURE", level: "block" });
  if (d.acknowledgedOn && (!d.despatchedOn || d.acknowledgedOn < d.despatchedOn)) out.push({ code: "ACK_BEFORE_DESPATCH", level: "block" });
  if (d.acknowledgedOn && d.acknowledgedOn > today) out.push({ code: "ACK_IN_FUTURE", level: "block" });
  return out;
}
