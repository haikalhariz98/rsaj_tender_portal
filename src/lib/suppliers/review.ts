/**
 * The review queue (FR-VND-007): an application is approved on an engine route (OD-2 A), or the
 * officer requests resubmission (per-document items, verbatim remarks, a deadline) or rejects it with
 * reasons. A lapsed deadline is derived from the organisation's day, never a scheduler: the
 * application reads "lapsed" the day after its deadline, and `recordLapse` records the rejection it
 * means (the notice shown, not sent: INT-09).
 *
 * Approval judges the file as it stands: every mandatory document type must stand (verified, valid
 * or not applicable) on the day; one not checked, not in order, expired or missing is refused by
 * name. The same rule is asked when the route opens and again when its last step approves, on the
 * rows as locked then. Pure.
 */

import { isDay } from "@/lib/dates";
import { addDays } from "@/lib/securities/period";

import { documentState, stands, type DocumentState } from "./documents";
import type { ApplicationKind, ApplicationOutcome, ApplicationStatus, DocumentFacts, DocumentTypeFacts, Finding, SupplierStatus } from "./types";

/// Whether an application is still open: received or awaiting a resubmission, and no lapse recorded.
export const isOpen = (a: { status: ApplicationStatus; lapsedRecordedAt: unknown }) => (a.status === "RECEIVED" || a.status === "RESUBMISSION_REQUESTED") && a.lapsedRecordedAt == null;

export type LapseState = "NO_DEADLINE" | "OPEN" | "LAPSED";

/// A resubmission deadline on the organisation's day: still open on the day itself, lapsed the day after.
export function lapseState(a: { status: ApplicationStatus; resubmitBy: string | null }, today: string): LapseState {
  if (a.status !== "RESUBMISSION_REQUESTED" || !a.resubmitBy) return "NO_DEADLINE";
  return today > a.resubmitBy ? "LAPSED" : "OPEN";
}

export type ReviewFault =
  | "TIME_ZONE_UNSET"
  | "DECIDED"
  | "LAPSED"
  | "LAPSE_UNRECORDED"
  | "NOT_LAPSED"
  | "ROUTE_PENDING"
  | "DECLARATION_DAY_REQUIRED"
  | "DECLARATION_SCAN_REQUIRED"
  | "TYPES_NOT_SET"
  | "DOCUMENT_NOT_STANDING"
  | "MANDATORY_NOT_SET"
  | "PERSON_REQUIRED"
  | "ITEMS_REQUIRED"
  | "ITEM_REMARKS_REQUIRED"
  | "ITEM_NOT_ON_FILE"
  | "ITEM_NAMES_NOTHING"
  | "DEADLINE_REQUIRED"
  | "DEADLINE_NOT_AFTER_TODAY"
  | "REMARKS_REQUIRED"
  | "OUTCOME_NOT_RECORDED_HERE"
  | "ALREADY_OPEN"
  | "KIND_REQUIRED"
  | "KIND_NOT_FOR_STATUS"
  | "BLACKLISTED_NO_APPLICATION"
  | "BLACKLISTED_NOT_APPROVED"
  | "CANCELLED_NEW_APPLICATION_ONLY"
  | "CANCELLED_APPROVE_FROM";

/// A blacklisting in effect on the day, as the review rules name it (FR-TRM-017). Null: none in effect.
export type BlacklistInEffect = { effectiveOn: string; endsOn: string | null; reasonLabel: string };

const blacklistData = (b: BlacklistInEffect) => ({ since: b.effectiveOn, endsOn: b.endsOn, reason: b.reasonLabel });

/// M-1 (6.13 Part B Run 0 fix round): the registration cancelled in effect on the day, as the standing reads it (one ended by
/// a later registration is not in effect). Null: none.
export type CancellationInEffect = { effectiveOn: string; cancelledBy: { body: string; reference: string } | null };

const cancellationData = (c: CancellationInEffect) => ({ since: c.effectiveOn, body: c.cancelledBy?.body ?? null, reference: c.cancelledBy?.reference ?? null });

/**
 * M-1 (BD-613-108, ADR 0019 Amendment 1's "the supplier registers again"): which kind of application a supplier may have.
 * A first registration (NEW) for a supplier not registered, or for one whose registration is cancelled (the way back); a
 * renewal or upgrade for one registered and not cancelled. While a cancellation is in effect a renewal or an upgrade is
 * refused, naming the exit: a new application. Asked when an application opens and again when it is approved, so one
 * opened before the cancellation was recorded is not approved under it.
 */
export function applicationKindFaults(kind: ApplicationKind, supplierStatus: SupplierStatus, cancellation: CancellationInEffect | null): Finding<ReviewFault>[] {
  const cancelled = supplierStatus === "REGISTERED" && cancellation != null;
  if (cancelled) return kind === "NEW" ? [] : [{ code: "CANCELLED_NEW_APPLICATION_ONLY", level: "block", data: { kind, ...cancellationData(cancellation!) } }];
  if ((kind === "NEW") !== (supplierStatus !== "REGISTERED")) return [{ code: "KIND_NOT_FOR_STATUS", level: "block", data: { kind } }];
  return [];
}

/// One mandatory type as approval reads it.
export interface MandatoryStanding {
  label: string;
  state: DocumentState;
}

export interface FileFacts {
  status: ApplicationStatus;
  lapsedRecordedAt: unknown;
  resubmitBy: string | null;
  routePending: boolean;
  declarationSignedOn: string | null;
  declarationScanned: boolean;
  /// Each live type marked mandatory, with its state on the day.
  mandatory: readonly MandatoryStanding[];
  /// Live types whose mandatory switch is not set: the file cannot be judged complete against them.
  mandatoryNotSet: readonly string[];
  /// How many live document types are configured at all.
  typesConfigured: number;
  /// FR-TRM-017 (6.15a fix S-2): the blacklisting in effect on the day, read from the standing; null: none.
  blacklist: BlacklistInEffect | null;
  /// M-1: what the application is for, the supplier's status and the cancellation in effect on the day (null: none), so
  /// approval asks again which kind the supplier may have (applicationKindFaults).
  kind: ApplicationKind;
  supplierStatus: SupplierStatus;
  cancellation: CancellationInEffect | null;
}

/**
 * Whether the file can be approved on `today`: open, not lapsed, the signed declaration's day recorded
 * and its scan attached, every live type's mandatory switch set, and every mandatory type standing.
 * FR-TRM-017 (fix S-2): while a blacklisting is in effect nothing is approved, naming the blacklisting.
 * Each failure names what to do. `routePending` is not judged here (the route's own last step asks this).
 */
export function approveFaults(f: Omit<FileFacts, "routePending">, today: string | null): Finding<ReviewFault>[] {
  if (today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<ReviewFault>[] = [];
  if (!isOpen(f)) return [{ code: "DECIDED", level: "block" }];
  if (lapseState(f, today) === "LAPSED") return [{ code: "LAPSED", level: "block", data: { resubmitBy: f.resubmitBy } }];
  if (f.blacklist) out.push({ code: "BLACKLISTED_NOT_APPROVED", level: "block", data: blacklistData(f.blacklist) });
  // M-1: the kind asked again on the day; and a new registration ends a cancellation only when it is later than the day the
  // cancellation took effect (standing's rule: registeredOn after effectiveOn), so it is not approved on that very day.
  out.push(...applicationKindFaults(f.kind, f.supplierStatus, f.cancellation));
  if (f.kind === "NEW" && f.supplierStatus === "REGISTERED" && f.cancellation && today <= f.cancellation.effectiveOn) out.push({ code: "CANCELLED_APPROVE_FROM", level: "block", data: { ...cancellationData(f.cancellation), from: addDays(f.cancellation.effectiveOn, 1) } });
  if (!f.declarationSignedOn) out.push({ code: "DECLARATION_DAY_REQUIRED", level: "block" });
  if (!f.declarationScanned) out.push({ code: "DECLARATION_SCAN_REQUIRED", level: "block" });
  if (f.typesConfigured === 0) out.push({ code: "TYPES_NOT_SET", level: "block" });
  for (const t of f.mandatoryNotSet) out.push({ code: "MANDATORY_NOT_SET", level: "block", data: { type: t } });
  for (const m of f.mandatory) if (!stands(m.state)) out.push({ code: "DOCUMENT_NOT_STANDING", level: "block", data: { type: m.label, state: m.state } });
  return out;
}

/// Sending the file for decision: approvable today, and no route already open on it.
export function submitFaults(f: FileFacts, today: string | null): Finding<ReviewFault>[] {
  const out = approveFaults(f, today);
  if (f.routePending) out.unshift({ code: "ROUTE_PENDING", level: "block" });
  return out;
}

export interface ResubmissionItemInput {
  /// The document the item is about, or null for one not lodged yet.
  documentId: string | null;
  /// The configured type it is about, where no document is lodged yet (a missing type).
  typeId: string | null;
  remarks: string;
}

export interface DecisionInput {
  outcome: ApplicationOutcome | null;
  remarks: string;
  resubmitBy: string | null;
  items: readonly ResubmissionItemInput[];
  personActive: boolean;
}

/**
 * An officer's outcome recorded on an open application (FR-VND-007): resubmission requested, with at
 * least one item, each with its remarks as written, and a deadline after today; or rejected, with the
 * remarks. Approval is the route's (`approveFaults` at its last step) and a lapse is `recordLapse`'s,
 * so neither is recorded here. Not while a route is open on the file, nor on a lapsed request: that is
 * recorded first.
 */
export function decisionFaults(i: DecisionInput, f: Pick<FileFacts, "status" | "lapsedRecordedAt" | "resubmitBy" | "routePending">, ctx: { today: string | null; documentIds: readonly string[]; typeIds: readonly string[] }): Finding<ReviewFault>[] {
  if (ctx.today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (!isOpen(f)) return [{ code: "DECIDED", level: "block" }];
  const out: Finding<ReviewFault>[] = [];
  if (lapseState(f, ctx.today) === "LAPSED") out.push({ code: "LAPSE_UNRECORDED", level: "block", data: { resubmitBy: f.resubmitBy } });
  if (f.routePending) out.push({ code: "ROUTE_PENDING", level: "block" });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  if (i.outcome === "RESUBMIT") {
    if (i.items.length === 0) out.push({ code: "ITEMS_REQUIRED", level: "block" });
    for (const it of i.items) {
      if (!it.remarks.trim()) out.push({ code: "ITEM_REMARKS_REQUIRED", level: "block" });
      if (it.documentId && !ctx.documentIds.includes(it.documentId)) out.push({ code: "ITEM_NOT_ON_FILE", level: "block" });
      else if (!it.documentId && (!it.typeId || !ctx.typeIds.includes(it.typeId))) out.push({ code: "ITEM_NAMES_NOTHING", level: "block" });
    }
    if (!i.resubmitBy || !isDay(i.resubmitBy)) out.push({ code: "DEADLINE_REQUIRED", level: "block" });
    else if (i.resubmitBy <= ctx.today) out.push({ code: "DEADLINE_NOT_AFTER_TODAY", level: "block" });
  } else if (i.outcome === "REJECT") {
    if (!i.remarks.trim()) out.push({ code: "REMARKS_REQUIRED", level: "block" });
  } else out.push({ code: "OUTCOME_NOT_RECORDED_HERE", level: "block" });
  return [...new Map(out.map((f) => [f.code, f])).values()];
}

/// Recording the rejection a lapsed deadline means: only on a request whose deadline has passed, once.
export function lapseFaults(f: Pick<FileFacts, "status" | "lapsedRecordedAt" | "resubmitBy">, today: string | null): Finding<ReviewFault>[] {
  if (today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (!isOpen(f)) return [{ code: "DECIDED", level: "block" }];
  if (lapseState(f, today) !== "LAPSED") return [{ code: "NOT_LAPSED", level: "block", data: { resubmitBy: f.resubmitBy } }];
  return [];
}

/// Opening a further application for a supplier on the register: none open already; a first registration
/// (NEW) only for a supplier not registered (one rejected may apply again) or whose registration is cancelled (M-1:
/// the way back), a renewal or upgrade only for one registered and not cancelled (applicationKindFaults), and never
/// while a blacklisting is in effect (FR-TRM-017, fix S-2), naming it.
export function openApplicationFaults(kind: ApplicationKind | null, supplierStatus: SupplierStatus, open: boolean, blacklist: BlacklistInEffect | null, cancellation: CancellationInEffect | null): Finding<ReviewFault>[] {
  const out: Finding<ReviewFault>[] = [];
  if (open) out.push({ code: "ALREADY_OPEN", level: "block" });
  if (!kind) out.push({ code: "KIND_REQUIRED", level: "block" });
  else out.push(...applicationKindFaults(kind, supplierStatus, cancellation));
  if (blacklist && kind !== "NEW") out.push({ code: "BLACKLISTED_NO_APPLICATION", level: "block", data: blacklistData(blacklist) });
  return out;
}

/**
 * The file as approval reads it on `today`: the live types' mandatory switches (set or not) and each
 * mandatory type's state from the supplier's documents. A retired type is neither required nor asked.
 */
export function fileFacts(
  app: Pick<FileFacts, "status" | "lapsedRecordedAt" | "resubmitBy" | "routePending" | "declarationSignedOn" | "declarationScanned" | "blacklist" | "kind" | "supplierStatus" | "cancellation">,
  types: readonly DocumentTypeFacts[],
  docs: readonly DocumentFacts[],
  today: string,
): FileFacts {
  const live = types.filter((t) => t.retiredOn == null || t.retiredOn > today);
  return {
    ...app,
    mandatory: live.filter((t) => t.mandatoryAtRegistration === true).map((t) => ({ label: t.label, state: documentState(docs.filter((d) => d.typeId === t.id), today).state })),
    mandatoryNotSet: live.filter((t) => t.mandatoryAtRegistration == null).map((t) => t.label),
    typesConfigured: live.length,
  };
}

/// What a decision was judged under, frozen on it and rendered from, never re-derived: each mandatory
/// type's state and where its "mandatory" setting comes from, the declaration's day, and the day judged.
export interface DecisionSnapshot {
  judgedOn: string;
  declarationSignedOn: string | null;
  mandatory: { type: string; state: DocumentState; provenance: string | null }[];
}

export function decisionSnapshot(f: FileFacts, today: string, provenanceOf: (typeLabel: string) => string | null): DecisionSnapshot {
  return { judgedOn: today, declarationSignedOn: f.declarationSignedOn, mandatory: f.mandatory.map((m) => ({ type: m.label, state: m.state, provenance: provenanceOf(m.label) })) };
}

export const isDecisionSnapshot = (v: unknown): v is DecisionSnapshot => !!v && typeof v === "object" && "judgedOn" in v && Array.isArray((v as DecisionSnapshot).mandatory);

/// Where an application stands for the queue, derived on the organisation's day: a route open on it reads
/// "with approval"; a request whose deadline passed reads "lapsed" before the lapse is recorded.
export type QueueState = "RECEIVED" | "WITH_APPROVAL" | "RESUBMISSION_REQUESTED" | "LAPSED" | "APPROVED" | "REJECTED" | "REJECTED_ON_LAPSE";

export function queueState(a: { status: ApplicationStatus; resubmitBy: string | null; lapsedRecordedAt: unknown; routes: readonly { status: string }[] }, today: string | null): QueueState {
  if (a.status === "APPROVED") return "APPROVED";
  if (a.status === "REJECTED") return a.lapsedRecordedAt != null ? "REJECTED_ON_LAPSE" : "REJECTED";
  if (a.routes.some((r) => r.status === "PENDING")) return "WITH_APPROVAL";
  if (a.status === "RESUBMISSION_REQUESTED") return today && lapseState(a, today) === "LAPSED" ? "LAPSED" : "RESUBMISSION_REQUESTED";
  return "RECEIVED";
}
