/**
 * The company estimate (FR-EST-006 to 010; ADR 0012). Pure.
 *
 * The sealed-figure rule (decisions log 2026-10-01): the estimate's figure never feeds a
 * band, a regime, an award check or a list, and every figure derived from it (against the
 * bill, and later minimum capital, variance, savings) and every amendment reason stays
 * sealed until `disclose()`. Here that means: nothing in this module returns a figure or a
 * reason unless it is handed `SealedFigures` (which only `readSealedFigures` in
 * estimate-store.ts produces) for an estimate whose state is DISCLOSED. Findings carry
 * codes and plain facts (a version number, a day), never a figure; `actionResult` hands an
 * action codes only.
 *
 * Lifecycle (OD-2): one preparer per estimate (`SECOND_PREPARER`); a preparer who cannot
 * continue has the estimate voided before lodgement, with the reason, its versions kept,
 * and a new officer prepares a fresh one from version 1. At most one estimate not void per
 * exercise. Lodging puts it in the sealed set; the retained copy is recorded as custody.
 * Amending after closing is refused once a closing exists (X-1: 6.2 passes null and the
 * finding says "Closing not set"; 6.4 passes the locked closingAt).
 */

import { dayIn } from "@/lib/dates";
import { lowers } from "@/lib/documents/classification";
import type { SecurityClass } from "@/lib/documents/types";
import type { ExerciseStatus } from "@/lib/method/types";
import { fitsMoneyColumn, type Sen } from "@/lib/money";

import { sharePct } from "./bq";
import type { EstimateState, Finding, ScopePolicy } from "./types";

/// An estimate as the rules see it: never its figure.
export interface EstimateFacts {
  state: EstimateState;
  preparerPersonId: string;
  currentVersionNo: number;
  classification: SecurityClass;
  /// The version the last lodgement lodged, null before one.
  lodgedVersionNo: number | null;
  /// The version whose copy was last recorded as retained, null before one.
  retainedVersionNo: number | null;
}

declare const SEALED: unique symbol;

/**
 * The sealed figures of one estimate: each version's figure and amendment reason. Only
 * `readSealedFigures` (estimate-store.ts) makes one, and only the functions below read it,
 * each refusing to show anything before disclosure.
 */
export interface SealedFigures {
  readonly [SEALED]: true;
  readonly estimateId: string;
  readonly versions: readonly { versionNo: number; value: Sen; reason: string }[];
}

/// For estimate-store.ts and the tests. Anything else calling it is caught by the source scan.
export const sealFigures = (estimateId: string, versions: SealedFigures["versions"]): SealedFigures => ({ estimateId, versions }) as unknown as SealedFigures;

/// Whether the exercise allows estimate acts, by its status. Exhaustive (X-8).
export function exerciseAllowsEstimate(status: ExerciseStatus): "OPEN" | "EXERCISE_CANCELLED" {
  switch (status) {
    case "DRAFT":
    case "DOCUMENTS_IN_PREPARATION":
    // 6.4: the estimate stays open while the pack is with approval and after: what closes it
    // is the closing (X-1, versionFaults), not the pack.
    case "PENDING_APPROVAL_FOR_TENDERING":
    case "APPROVED_FOR_TENDERING":
      return "OPEN";
    case "CANCELLED":
      return "EXERCISE_CANCELLED";
    default: {
      const never: never = status;
      return never;
    }
  }
}

export type VersionFault =
  | "NOT_POSITIVE"
  | "TOO_LARGE"
  | "PERSON_REQUIRED"
  | "SECOND_PREPARER"
  | "REASON_REQUIRED"
  | "AFTER_CLOSING"
  | "CLOSING_NOT_SET"
  | "DISCLOSED"
  | "VOID"
  | "EXERCISE_CANCELLED"
  | "TIME_ZONE_NOT_SET";

/**
 * Preparing version 1 (`est` null) or amending to the next version. `value` is the typed
 * figure in sen, null when it is not a figure. The closing: once `closingAt` exists, a
 * version made at or after it is refused; while it does not, the finding says so and does
 * not block (X-1). `preparedOn` is the organisation's day at save, so an unset time zone
 * blocks rather than assume UTC's day.
 */
export function versionFaults(
  i: { value: Sen | null; personId: string | null; reason: string },
  est: Pick<EstimateFacts, "state" | "preparerPersonId"> | null,
  ctx: { closingAt: Date | null; timeZone: string | null; exerciseStatus: ExerciseStatus; now: Date },
): Finding<VersionFault>[] {
  const out: Finding<VersionFault>[] = [];
  if (exerciseAllowsEstimate(ctx.exerciseStatus) !== "OPEN") out.push({ code: "EXERCISE_CANCELLED", level: "block" });
  if (est?.state === "VOID") out.push({ code: "VOID", level: "block" });
  if (est?.state === "DISCLOSED") out.push({ code: "DISCLOSED", level: "block" });
  if (i.value == null || i.value <= 0n) out.push({ code: "NOT_POSITIVE", level: "block" });
  // CompanyEstimateVersion.value is Decimal(18, 2). The code alone goes back: never the figure.
  else if (!fitsMoneyColumn(i.value)) out.push({ code: "TOO_LARGE", level: "block" });
  if (!i.personId) out.push({ code: "PERSON_REQUIRED", level: "block" });
  else if (est && i.personId !== est.preparerPersonId) out.push({ code: "SECOND_PREPARER", level: "block" });
  if (est && !i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (ctx.closingAt == null) out.push({ code: "CLOSING_NOT_SET", level: "info" });
  else if (ctx.now.getTime() >= ctx.closingAt.getTime()) out.push({ code: "AFTER_CLOSING", level: "block" });
  if (ctx.timeZone == null) out.push({ code: "TIME_ZONE_NOT_SET", level: "block" });
  return out;
}

export type StartFault = "LIVE_ESTIMATE_EXISTS";

/// OD-2: at most one estimate not void per exercise.
export function startFault(estimates: readonly { state: EstimateState }[]): Finding<StartFault> | null {
  return estimates.some((e) => e.state !== "VOID") ? { code: "LIVE_ESTIMATE_EXISTS", level: "block" } : null;
}

export type VoidFault = "ALREADY_VOID" | "AFTER_LODGEMENT" | "REASON_REQUIRED";

/// OD-2: voided before lodgement only, with the reason (why the preparer cannot continue; never a figure).
export function voidFault(est: Pick<EstimateFacts, "state">, reason: string): Finding<VoidFault>[] {
  if (est.state === "VOID") return [{ code: "ALREADY_VOID", level: "block" }];
  const out: Finding<VoidFault>[] = [];
  if (est.state === "LODGED" || est.state === "DISCLOSED") out.push({ code: "AFTER_LODGEMENT", level: "block" });
  if (!reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}

export type LodgeFault = "VOID" | "DISCLOSED" | "ALREADY_LODGED" | "PERSON_REQUIRED" | "EXERCISE_CANCELLED";

/// Lodging the current version into the sealed set. A version amended after lodgement is lodged again.
export function lodgeFaults(est: EstimateFacts, i: { personId: string | null }, exerciseStatus: ExerciseStatus): Finding<LodgeFault>[] {
  const out: Finding<LodgeFault>[] = [];
  if (exerciseAllowsEstimate(exerciseStatus) !== "OPEN") out.push({ code: "EXERCISE_CANCELLED", level: "block" });
  if (est.state === "VOID") out.push({ code: "VOID", level: "block" });
  if (est.state === "DISCLOSED") out.push({ code: "DISCLOSED", level: "block" });
  if (est.state === "LODGED" && est.lodgedVersionNo === est.currentVersionNo) out.push({ code: "ALREADY_LODGED", level: "block", data: { versionNo: est.currentVersionNo } });
  if (!i.personId) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/// Whether the lodged copy is behind the current version (amended since lodgement).
export const lodgementBehind = (est: EstimateFacts) => est.state === "LODGED" && est.lodgedVersionNo != null && est.lodgedVersionNo < est.currentVersionNo;

export type RetainFault = "NOT_LODGED" | "PLACE_REQUIRED" | "PERSON_REQUIRED" | "ALREADY_RETAINED";

/// The second copy, retained (FR-EST-007): after lodgement, of the lodged version, where it is kept.
export function retainFaults(est: EstimateFacts, i: { personId: string | null; place: string }): Finding<RetainFault>[] {
  const out: Finding<RetainFault>[] = [];
  if (est.state !== "LODGED") out.push({ code: "NOT_LODGED", level: "block" });
  else if (est.retainedVersionNo != null && est.retainedVersionNo === est.lodgedVersionNo) out.push({ code: "ALREADY_RETAINED", level: "block", data: { versionNo: est.lodgedVersionNo } });
  if (!i.place.trim()) out.push({ code: "PLACE_REQUIRED", level: "block" });
  if (!i.personId) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/**
 * Whether the retained copy is still to be recorded for the version lodged: lodged, and
 * no copy retained of that version yet — including after a re-lodgement, where the copy
 * retained earlier is of an older version (BD-62-6). The screen offers Record it on this.
 */
export const retainedCopyDue = (est: Pick<EstimateFacts, "state" | "lodgedVersionNo" | "retainedVersionNo">) =>
  est.state === "LODGED" && est.lodgedVersionNo != null && est.retainedVersionNo !== est.lodgedVersionNo;

export type ClassificationFault = "CLASSIFICATION_LOWERED";

/// FR-EST-008: SULIT from creation and never lowered (via the document store's one rule).
export function classificationFault(current: SecurityClass, next: SecurityClass): Finding<ClassificationFault> | null {
  return lowers(current, next) ? { code: "CLASSIFICATION_LOWERED", level: "block", data: { from: current, to: next } } : null;
}

// ------------------------------------------------------------------ lead time (OD-3)

export type LeadState = "READY" | "LATE" | "NOT_PREPARED" | "LEAD_NOT_SET" | "CLOSING_NOT_SET" | "TIME_ZONE_NOT_SET";

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * OD-3 (ASSUMED reading, shown): READY when the last version's organisation day is on or
 * before the closing day less the lead; no inclusive switch. The last version is a day
 * (as stored) or an instant (judged in the organisation's zone). Unset lead, closing or
 * zone each say so, in that order; 6.7 refuses on LATE and owns the override.
 */
export function leadTime(
  lastVersion: string | Date | null,
  closingAt: Date | null,
  policy: Pick<ScopePolicy, "estimateLeadDays">,
  timeZone: string | null,
): { state: LeadState; lastPermittedDay?: string; lastVersionDay?: string } {
  if (policy.estimateLeadDays == null) return { state: "LEAD_NOT_SET" };
  if (closingAt == null) return { state: "CLOSING_NOT_SET" };
  if (timeZone == null) return { state: "TIME_ZONE_NOT_SET" };
  const lastPermittedDay = addDays(dayIn(closingAt, timeZone), -policy.estimateLeadDays);
  if (lastVersion == null) return { state: "NOT_PREPARED", lastPermittedDay };
  const lastVersionDay = typeof lastVersion === "string" ? lastVersion : dayIn(lastVersion, timeZone);
  return { state: lastVersionDay <= lastPermittedDay ? "READY" : "LATE", lastPermittedDay, lastVersionDay };
}

export type OverrideFault = "OVERRIDE_NOT_PERMITTED" | "NOT_HOLDER" | "PERSON_REQUIRED" | "REASON_REQUIRED";

/// A late estimate's override (6.7 acts on it). Unset override office: no override, ever.
export function overrideFaults(i: { personId: string | null; holdsOverrideRole: boolean; reason: string }, policy: Pick<ScopePolicy, "estimateOverrideRoleCode">): Finding<OverrideFault>[] {
  if (policy.estimateOverrideRoleCode == null) return [{ code: "OVERRIDE_NOT_PERMITTED", level: "block" }];
  const out: Finding<OverrideFault>[] = [];
  if (!i.personId) out.push({ code: "PERSON_REQUIRED", level: "block" });
  else if (!i.holdsOverrideRole) out.push({ code: "NOT_HOLDER", level: "block" });
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}

// ------------------------------------------------------------------ custody (for sign-in, not wired: OD-1)

export interface RoleHolding {
  personId: string;
  roleCode: string;
  from: string;
  to: string | null;
}

/**
 * Who holds the estimate's copies on a day: its preparer, and the holders of the configured
 * custodian and audit offices. Built for sign-in; nothing reveals a figure on it (OD-1).
 * Either office unset says so: never read as "nobody" or "everybody".
 */
export function custodyList(policy: Pick<ScopePolicy, "estimateCustodianRoleCode" | "estimateAuditRoleCode">, holders: readonly RoleHolding[], preparerId: string, day: string): { state: "SET"; personIds: string[] } | { state: "NOT_SET"; missing: ("CUSTODIAN" | "AUDIT")[] } {
  const missing = [...(policy.estimateCustodianRoleCode == null ? (["CUSTODIAN"] as const) : []), ...(policy.estimateAuditRoleCode == null ? (["AUDIT"] as const) : [])];
  if (missing.length) return { state: "NOT_SET", missing };
  const roles = [policy.estimateCustodianRoleCode, policy.estimateAuditRoleCode];
  const on = holders.filter((h) => roles.includes(h.roleCode) && h.from <= day && (h.to == null || day <= h.to)).map((h) => h.personId);
  return { state: "SET", personIds: [...new Set([preparerId, ...on])] };
}

export type ViewFault = "SEALED" | "CUSTODY_NOT_SET" | "NOT_IN_CUSTODY";

/// Whether a signed-in person may see the figure: nobody before disclosure (OD-1); after it, those in custody.
export function viewFault(personId: string, est: Pick<EstimateFacts, "state">, custody: ReturnType<typeof custodyList>): ViewFault | null {
  if (est.state !== "DISCLOSED") return "SEALED";
  if (custody.state === "NOT_SET") return "CUSTODY_NOT_SET";
  return custody.personIds.includes(personId) ? null : "NOT_IN_CUSTODY";
}

// ------------------------------------------------------------------ sealed until disclosure

export type Sealed = { sealed: true };
const SEALED_VIEW: Sealed = { sealed: true };

export type EstimateView = Sealed | { sealed: false; current: Sen; versions: readonly { versionNo: number; value: Sen; reason: string }[] };

/// What may be shown of the figure: nothing until DISCLOSED, and only from figures of this estimate.
export function estimateView(est: Pick<EstimateFacts, "state" | "currentVersionNo"> & { id: string }, figures: SealedFigures | null): EstimateView {
  if (est.state !== "DISCLOSED" || figures == null || figures.estimateId !== est.id) return SEALED_VIEW;
  const current = figures.versions.find((v) => v.versionNo === est.currentVersionNo);
  if (!current) return SEALED_VIEW;
  return { sealed: false, current: current.value, versions: figures.versions };
}

export type DiscloseFault = "NOT_LODGED" | "VOID" | "ALREADY_DISCLOSED";

/// FR-EST-010 (6.7 calls it at opening): a lodged estimate becomes DISCLOSED at that instant.
export function disclose(est: Pick<EstimateFacts, "state">, at: Date): { ok: true; state: "DISCLOSED"; disclosedAt: Date } | { ok: false; fault: DiscloseFault } {
  switch (est.state) {
    case "LODGED":
      return { ok: true, state: "DISCLOSED", disclosedAt: at };
    case "DRAFT":
      return { ok: false, fault: "NOT_LODGED" };
    case "VOID":
      return { ok: false, fault: "VOID" };
    case "DISCLOSED":
      return { ok: false, fault: "ALREADY_DISCLOSED" };
  }
}

/// A difference and its percentage of the base, signed, four places.
function difference(value: Sen, base: Sen): { difference: Sen; pct: string | null } {
  const d = value - base;
  const p = sharePct(d < 0n ? -d : d, base);
  return { difference: d, pct: p == null ? null : d < 0n ? `-${p}` : p };
}

/// The estimate against the bill's total: sealed until disclosed; with no bill, says so.
export function againstBill(view: EstimateView, billTotal: Sen | null): Sealed | { sealed: false; bill: null } | { sealed: false; bill: Sen; difference: Sen; pct: string | null } {
  if (view.sealed) return SEALED_VIEW;
  if (billTotal == null) return { sealed: false, bill: null };
  return { sealed: false, bill: billTotal, ...difference(view.current, billTotal) };
}

/// The opening schedule's benchmark row (OD-8, ASSUMED reading; 6.7 shows it). Its label is configured; unset says so.
export function benchmarkRow(est: Pick<EstimateFacts, "state" | "currentVersionNo"> & { id: string }, figures: SealedFigures | null, policy: Pick<ScopePolicy, "benchmarkLabelEn">): Sealed | { sealed: false; label: string | null; value: Sen; provenance: "ASSUMED" } {
  const view = estimateView(est, figures);
  if (view.sealed) return SEALED_VIEW;
  return { sealed: false, label: policy.benchmarkLabelEn, value: view.current, provenance: "ASSUMED" };
}

/// What an estimate action hands back to its form: codes only, never data, a figure or a reason.
export function actionResult(faults: readonly Finding[]): { ok: true } | { ok: false; codes: string[] } {
  const blocks = faults.filter((f) => f.level === "block");
  return blocks.length ? { ok: false, codes: blocks.map((f) => f.code) } : { ok: true };
}
