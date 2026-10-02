/**
 * The routing sheet, as a projection (FR-CRT-007–009, ADR 0023, OD-4 A). Pure.
 *
 * One entity covers every CPD/DFA sheet: a type (configuration), frozen when the sheet starts; DATE (1), the
 * day the document was received (entered, never in the future); the internal checks recorded against the
 * type's check definitions (Checked, Verified, Endorsed), one set per iteration; and the approval matrix's
 * own route (ApprovalInstance and its steps), read as it is and never copied. Each resubmission is a new
 * route (ADR 0009) and a new iteration, shown beside the earlier one. DATE (2) is the day the approving step
 * decided. The elapsed time is counted in calendar days (OD-3 A, assumed and shown) against the ICC target
 * the type sets, banded by an exact percentage where the type bands it (ADR 0024). No target set reads
 * "Target not set", never "met".
 */

import { daysFrom } from "@/lib/dates";
import { bandFor, type ExactRatio } from "@/lib/percent-band";

import type { CertificateKind, Finding, Provenance, RoutingCheckKind, RoutingSubject } from "./types";

export interface CheckDef {
  order: number;
  kind: RoutingCheckKind;
  labelEn: string;
  labelMs: string | null;
  officeCode: string | null;
  /// The office's name as it read when frozen.
  officeLabel: string | null;
  /// This stage's printed days, where the form prints them.
  targetDays: number | null;
}

export interface TargetRow {
  pctMin: string | null;
  pctMax: string | null;
  targetDays: number;
  provenance: Provenance;
}

/// A routing sheet type as frozen when a sheet starts on it: later configuration never moves the sheet.
export interface RoutingTypeSnapshot {
  typeId: string;
  code: string;
  labelEn: string;
  labelMs: string | null;
  subject: RoutingSubject;
  certificateKind: CertificateKind | null;
  upperEdgeInclusive: boolean | null;
  provenance: Provenance;
  checks: CheckDef[];
  targets: TargetRow[];
  /// The organisation's day it was frozen.
  frozenOn: string;
}

export interface TypeNow {
  id: string;
  code: string;
  labelEn: string;
  labelMs: string | null;
  subject: RoutingSubject;
  certificateKind: CertificateKind | null;
  upperEdgeInclusive: boolean | null;
  provenance: Provenance;
  retiredOn: string | null;
  checks: readonly CheckDef[];
  targets: readonly TargetRow[];
}

export function freezeRoutingType(t: TypeNow, frozenOn: string): RoutingTypeSnapshot {
  return {
    typeId: t.id,
    code: t.code,
    labelEn: t.labelEn,
    labelMs: t.labelMs,
    subject: t.subject,
    certificateKind: t.certificateKind,
    upperEdgeInclusive: t.upperEdgeInclusive,
    provenance: t.provenance,
    checks: [...t.checks].sort((a, b) => a.order - b.order).map((c) => ({ ...c })),
    targets: t.targets.map((x) => ({ ...x })),
    frozenOn,
  };
}

export function readRoutingSnapshot(json: unknown): RoutingTypeSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const s = json as Partial<RoutingTypeSnapshot>;
  if (typeof s.typeId !== "string" || !Array.isArray(s.checks) || !Array.isArray(s.targets)) return null;
  return s as RoutingTypeSnapshot;
}

/// Why a type cannot start a sheet for this subject (and certificate kind) today.
export function typeFaults(t: TypeNow | null, subject: RoutingSubject, kind: CertificateKind | null, today: string): Finding[] {
  if (!t) return [{ code: "TYPE_NOT_FOUND", level: "block" }];
  const out: Finding[] = [];
  if (t.retiredOn && t.retiredOn <= today) out.push({ code: "TYPE_RETIRED", level: "block", data: { type: t.labelEn } });
  if (t.subject !== subject) out.push({ code: "TYPE_OTHER_SUBJECT", level: "block", data: { type: t.labelEn } });
  else if (subject === "CERTIFICATE" && t.certificateKind != null && t.certificateKind !== kind) out.push({ code: "TYPE_OTHER_KIND", level: "block", data: { type: t.labelEn } });
  return out;
}

/// Elapsed calendar days from DATE (1) to DATE (2) (OD-3 A).
export const elapsedDays = (from: string, to: string): number => daysFrom(from, to);

export type Target =
  | { state: "SET"; days: number; band: { pctMin: string | null; pctMax: string | null } | null; provenance: Provenance }
  | { state: "NOT_SET" }
  | { state: "NO_RATIO" }
  | { state: "EDGE_UNDECIDED"; edge: string }
  | { state: "NO_BAND" }
  | { state: "OVERLAP" };

/**
 * The target for a sheet. One unbanded row: its days. Banded rows: the band the exact ratio falls in, under
 * the type's edge switch. No row: NOT_SET (never "met").
 */
export function targetFor(type: Pick<RoutingTypeSnapshot, "targets" | "upperEdgeInclusive">, ratio: ExactRatio | null): Target {
  const rows = type.targets;
  if (rows.length === 0) return { state: "NOT_SET" };
  const banded = rows.filter((r) => r.pctMin != null || r.pctMax != null);
  if (banded.length === 0) {
    if (rows.length > 1) return { state: "OVERLAP" };
    return { state: "SET", days: rows[0].targetDays, band: null, provenance: rows[0].provenance };
  }
  if (!ratio) return { state: "NO_RATIO" };
  const b = bandFor(ratio, rows, type.upperEdgeInclusive);
  if (b.state === "EDGE_UNDECIDED") return { state: "EDGE_UNDECIDED", edge: b.edge };
  if (b.state === "NONE") return { state: "NO_BAND" };
  if (b.state === "OVERLAP") return { state: "OVERLAP" };
  return { state: "SET", days: b.band.targetDays, band: { pctMin: b.band.pctMin, pctMax: b.band.pctMax }, provenance: b.band.provenance };
}

export type Verdict =
  | { state: "MET"; elapsed: number; target: number }
  | { state: "OVER"; elapsed: number; target: number; by: number }
  | { state: "OPEN"; soFar: number; target: number | null; overBy: number }
  | { state: "NOT_MEASURED"; elapsed: number | null }
  | { state: "NOT_STARTED" };

/// Elapsed against the target. Without a target the elapsed time is shown and never called met.
export function verdictOf(date1: string | null, date2: string | null, today: string, target: Target): Verdict {
  if (!date1) return { state: "NOT_STARTED" };
  const days = target.state === "SET" ? target.days : null;
  if (!date2) {
    const soFar = elapsedDays(date1, today);
    return days == null ? { state: "NOT_MEASURED", elapsed: null } : { state: "OPEN", soFar, target: days, overBy: Math.max(0, soFar - days) };
  }
  const elapsed = elapsedDays(date1, date2);
  if (days == null) return { state: "NOT_MEASURED", elapsed };
  return elapsed <= days ? { state: "MET", elapsed, target: days } : { state: "OVER", elapsed, target: days, by: elapsed - days };
}

export interface RouteStep {
  sequence: number;
  roleLabel: string;
  actingRoleLabel: string | null;
  act: string;
  committeeCode: string | null;
  decision: string;
  decidedByName: string | null;
  decidedOn: string | null;
  receivedOn: string | null;
}

export interface RouteRow {
  id: string;
  status: string;
  /// The organisation's day the route opened (a resubmission's day).
  openedOn: string;
  /// Orders two routes opened on one day.
  createdAt: Date;
  steps: readonly RouteStep[];
}

export interface RecordedCheck {
  iteration: number;
  defOrder: number;
  personName: string;
  on: string;
  note: string;
}

export interface SheetInput {
  type: RoutingTypeSnapshot;
  /// DATE (1). Null: not recorded.
  receivedOn: string | null;
  routes: readonly RouteRow[];
  checks: readonly RecordedCheck[];
  ratio: ExactRatio | null;
  today: string;
}

export interface Iteration {
  n: number;
  /// The day this iteration started: DATE (1) for the first, the resubmitted route's opening day after.
  receivedOn: string | null;
  checks: { def: CheckDef; recorded: RecordedCheck | null }[];
  route: RouteRow | null;
  /// The day its route was decided (approved or refused), where it was.
  endedOn: string | null;
  elapsed: number | null;
}

export interface Sheet {
  type: RoutingTypeSnapshot;
  date1: string | null;
  date2: string | null;
  iterations: Iteration[];
  current: Iteration;
  /// Every check of the current iteration is recorded.
  checksDone: boolean;
  /// The current iteration's route: none, pending, approved or refused.
  routeState: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  target: Target;
  verdict: Verdict;
  /// OQ-17: the stages' printed days, where every stage prints them, and whether that differs from the total.
  parts: { sum: number; differs: boolean } | null;
}

/// The step whose decision ends the route: the last approving person step (A or MA, not a committee's), else the last step.
function approvingStep(r: RouteRow): RouteStep | null {
  const steps = [...r.steps].sort((a, b) => a.sequence - b.sequence);
  return [...steps].reverse().find((s) => (s.act === "A" || s.act === "MA") && !s.committeeCode) ?? steps.at(-1) ?? null;
}

function endOf(r: RouteRow): string | null {
  if (r.status === "APPROVED") return approvingStep(r)?.decidedOn ?? null;
  if (r.status === "REJECTED") return r.steps.filter((s) => s.decision === "REJECTED").map((s) => s.decidedOn).filter((d): d is string => d != null).sort().at(-1) ?? null;
  return null;
}

export function routingSheet(i: SheetInput): Sheet {
  const routes = [...i.routes].sort((a, b) => (a.openedOn === b.openedOn ? a.createdAt.getTime() - b.createdAt.getTime() : a.openedOn < b.openedOn ? -1 : 1));
  const count = Math.max(1, routes.length);
  const iterations: Iteration[] = [];
  for (let n = 1; n <= count; n++) {
    const route = routes[n - 1] ?? null;
    const receivedOn = n === 1 ? i.receivedOn : (route?.openedOn ?? null);
    const endedOn = route ? endOf(route) : null;
    iterations.push({
      n,
      receivedOn,
      checks: i.type.checks.map((def) => ({ def, recorded: i.checks.find((c) => c.iteration === n && c.defOrder === def.order) ?? null })),
      route,
      endedOn,
      elapsed: receivedOn && endedOn ? elapsedDays(receivedOn, endedOn) : null,
    });
  }
  const current = iterations[iterations.length - 1];
  const last = current.route;
  const routeState: Sheet["routeState"] = !last ? "NONE" : last.status === "APPROVED" ? "APPROVED" : last.status === "REJECTED" ? "REJECTED" : "PENDING";
  const date2 = last && last.status === "APPROVED" ? endOf(last) : null;
  const target = targetFor(i.type, i.ratio);
  const stageDays = i.type.checks.map((c) => c.targetDays);
  const parts = stageDays.length > 0 && stageDays.every((d) => d != null) ? { sum: stageDays.reduce((a, b) => a! + b!, 0)!, differs: target.state === "SET" && stageDays.reduce((a, b) => a! + b!, 0) !== target.days } : null;
  return {
    type: i.type,
    date1: i.receivedOn,
    date2,
    iterations,
    current,
    checksDone: current.checks.every((c) => c.recorded != null),
    routeState,
    target,
    verdict: verdictOf(i.receivedOn, date2, i.today, target),
    parts,
  };
}

export interface CheckInput {
  /// The sheet is open for checks (a certificate IN_ROUTING; an award's sheet before the award is decided).
  open: boolean;
  sheet: Sheet;
  defOrder: number;
  person: { id: string; name: string; isActive: boolean } | null;
  /// Holders of the check's office on the day (and live delegates of the whole office). Null: the check names no office.
  holders: { holderIds: readonly string[]; delegateIds: readonly string[] } | null;
  on: string;
  today: string;
}

/// Why an internal check cannot be recorded. Recorded on behalf of, not signed.
export function checkFaults(c: CheckInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!c.open) {
    f("SHEET_CLOSED");
    return out;
  }
  const it = c.sheet.current;
  if (!it.receivedOn) f("RECEIVED_NOT_RECORDED");
  const slot = it.checks.find((x) => x.def.order === c.defOrder);
  if (!slot) {
    f("UNKNOWN_CHECK");
    return out;
  }
  if (slot.recorded) f("ALREADY_CHECKED", { check: slot.def.labelEn });
  const earlier = it.checks.find((x) => x.def.order < c.defOrder && !x.recorded);
  if (earlier) f("CHECK_OUT_OF_ORDER", { check: slot.def.labelEn, first: earlier.def.labelEn });
  if (c.on > c.today) f("FUTURE_DATE", { day: c.on });
  if (it.receivedOn && c.on < it.receivedOn) f("BEFORE_RECEIVED", { day: it.receivedOn });
  const prior = it.checks.filter((x) => x.def.order < c.defOrder && x.recorded).map((x) => x.recorded!.on).sort().at(-1);
  if (prior && c.on < prior) f("BEFORE_EARLIER_CHECK", { day: prior });
  if (!c.person) f("PERSON_REQUIRED");
  else {
    if (!c.person.isActive) f("INACTIVE", { name: c.person.name });
    if (slot.def.officeCode && c.holders && !c.holders.holderIds.includes(c.person.id) && !c.holders.delegateIds.includes(c.person.id)) f("NOT_HOLDER", { name: c.person.name, office: slot.def.officeLabel ?? "the office" });
  }
  return out;
}

/// DATE (1): entered, never in the future, never after a check already recorded in the first iteration.
export function receivedFaults(open: boolean, day: string, today: string, firstCheckOn: string | null): Finding[] {
  const out: Finding[] = [];
  if (!open) out.push({ code: "SHEET_CLOSED", level: "block" });
  if (day > today) out.push({ code: "FUTURE_DATE", level: "block", data: { day } });
  if (firstCheckOn && day > firstCheckOn) out.push({ code: "AFTER_CHECKS", level: "block", data: { day: firstCheckOn } });
  return out;
}
