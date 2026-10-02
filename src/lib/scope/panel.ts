/**
 * The specification panel (FR-EST-005, 6.2 Q-1). Pure.
 *
 * The panel form's facts — contract kind and project status from the configured lists or
 * "please specify", the current and revised revision, the completion period, the bill it
 * certifies — and one verification per configured column, each naming a Person: attested,
 * "recorded on behalf of, not signed". It is VERIFIED only when every column is verified,
 * the verifiers are within the signatory limit, and a live SULIT scan of the signed form is
 * attached (Q-1). Editing a verified panel clears its verifications (kept, marked cleared)
 * and returns it to a draft. Enforced at the pack by 6.4 (OD-4); shown here.
 */

import type { ExerciseStatus } from "@/lib/method/types";

import type { BqStatus, Finding, PanelStatus, ScopePolicy } from "./types";

export interface PanelColumn {
  code: string;
  labelEn: string;
  retiredOn: string | null;
}

export interface PanelVerificationFact {
  columnCode: string;
  personId: string;
  clearedAt: Date | null;
}

export interface PanelFacts {
  status: PanelStatus;
  contractKindCode: string | null;
  contractKindOther: string;
  projectStatusCode: string | null;
  projectStatusOther: string;
  /// The bill it certifies, with that version's status. Null: none named.
  bq: { status: BqStatus } | null;
  verifications: readonly PanelVerificationFact[];
  /// Live attachments of the signed form whose document is SULIT (Q-1).
  liveSulitScans: number;
}

/// Whether the exercise allows the panel to be edited or verified, by its status. Exhaustive
/// (X-8): a status added to ExerciseStatus fails to compile here until it is decided.
export function exerciseAllowsPanel(status: ExerciseStatus): "OPEN" | "PACK_FROZEN" | "EXERCISE_CANCELLED" {
  switch (status) {
    case "DRAFT":
    case "DOCUMENTS_IN_PREPARATION":
      return "OPEN";
    // 6.4: the tender pack froze on this bill and panel; a change waits for its return for
    // amendment (or, once approved, for an addendum, 6.5).
    case "PENDING_APPROVAL_FOR_TENDERING":
    case "APPROVED_FOR_TENDERING":
    // 6.5: published on the frozen pack; a change is an addendum.
    case "ADVERTISED":
    case "INVITED":
    // 6.7: opened on the frozen pack.
    case "OPENING_IN_PROGRESS":
    case "OPENED":
    // 6.8 (X-8): under evaluation and evaluated follow the opening.
    case "UNDER_EVALUATION":
    case "EVALUATED":
      return "PACK_FROZEN";
    case "CANCELLED":
      return "EXERCISE_CANCELLED";
    default: {
      const never: never = status;
      return never;
    }
  }
}

/// The columns in force on a day: those not retired by it.
export const columnsInForce = (columns: readonly PanelColumn[], day: string | null) => columns.filter((c) => c.retiredOn == null || (day != null && c.retiredOn > day));

/// The verifications standing: not cleared by a later edit.
export const standingVerifications = (vs: readonly PanelVerificationFact[]) => vs.filter((v) => v.clearedAt == null);

/// The panel as a reader should take it (BD-62-26). A VERIFIED panel counts as verified only
/// while a scan named in its `verifiedSnapshot` is live: once each of those is withdrawn or
/// taken off it reads SCAN_GONE, and a different scan attached since (another document, or
/// another version of the same one) never re-verifies it. The exit is to verify it again
/// (`verifyPanelFault`), which re-judges it and freezes the scans live then.
export type PanelState = "NONE" | "DRAFT" | "VERIFIED" | "SCAN_GONE";

/// The document versions a verified panel's snapshot names. A missing or malformed snapshot names none.
export function verifiedScanVersionIds(snapshot: unknown): string[] {
  if (typeof snapshot !== "object" || snapshot === null || !("scans" in snapshot)) return [];
  const scans = (snapshot as { scans: unknown }).scans;
  if (!Array.isArray(scans)) return [];
  return scans.flatMap((s) => (typeof s === "object" && s !== null && typeof (s as { versionId?: unknown }).versionId === "string" ? [(s as { versionId: string }).versionId] : []));
}

export function panelState(p: { status: PanelStatus; liveScanVersionIds: readonly string[]; verifiedSnapshot: unknown } | null): PanelState {
  if (!p) return "NONE";
  switch (p.status) {
    case "DRAFT":
      return "DRAFT";
    case "VERIFIED": {
      const named = verifiedScanVersionIds(p.verifiedSnapshot);
      return named.some((id) => p.liveScanVersionIds.includes(id)) ? "VERIFIED" : "SCAN_GONE";
    }
    default: {
      const never: never = p.status;
      return never;
    }
  }
}

export type MarkVerifiedFault = "PANEL_NOT_STARTED" | "PANEL_ALREADY_VERIFIED";

/**
 * Whether the panel may be marked verified at all, by its state: a draft may, and so may a
 * panel whose verified scan is gone (verified again, explicitly and audited, with a fresh
 * snapshot of the scans live then). One already standing verified may not. What it is
 * judged on is `panelFaults`.
 */
export function verifyPanelFault(state: PanelState): Finding<MarkVerifiedFault> | null {
  switch (state) {
    case "NONE":
      return { code: "PANEL_NOT_STARTED", level: "block" };
    case "VERIFIED":
      return { code: "PANEL_ALREADY_VERIFIED", level: "block" };
    case "DRAFT":
    case "SCAN_GONE":
      return null;
    default: {
      const never: never = state;
      return never;
    }
  }
}

export type PanelFault =
  | "EXERCISE_CANCELLED"
  | "PACK_FROZEN"
  | "COLUMNS_NOT_SET"
  | "COLUMN_UNVERIFIED"
  | "OVER_SIGNATORY_LIMIT"
  | "LIMIT_NOT_SET"
  | "LISTS_NOT_SET"
  | "KIND_NOT_SET"
  | "STATUS_NOT_SET"
  | "BQ_NOT_NAMED"
  | "BQ_NOT_FINALISED"
  | "SCAN_REQUIRED";

/**
 * Whether the panel may be marked VERIFIED, and what stands in the way. `bqRequired` is the
 * exercise's contract basis's answer (null: not set, judged by packFaults, not here).
 */
export function panelFaults(
  p: PanelFacts,
  ctx: { columns: readonly PanelColumn[]; policy: ScopePolicy; today: string | null; exerciseStatus: ExerciseStatus; bqRequired: boolean | null },
): Finding<PanelFault>[] {
  const out: Finding<PanelFault>[] = [];
  const allows = exerciseAllowsPanel(ctx.exerciseStatus);
  if (allows !== "OPEN") out.push({ code: allows, level: "block" });
  const columns = columnsInForce(ctx.columns, ctx.today);
  const standing = standingVerifications(p.verifications);
  if (columns.length === 0) out.push({ code: "COLUMNS_NOT_SET", level: "block" });
  for (const c of columns) if (!standing.some((v) => v.columnCode === c.code)) out.push({ code: "COLUMN_UNVERIFIED", level: "block", data: { column: c.labelEn } });
  const signatories = new Set(standing.filter((v) => columns.some((c) => c.code === v.columnCode)).map((v) => v.personId)).size;
  const limit = ctx.policy.panelSignatoryLimit;
  if (limit == null) out.push({ code: "LIMIT_NOT_SET", level: "warn" });
  else if (signatories > limit) out.push({ code: "OVER_SIGNATORY_LIMIT", level: "block", data: { signatories, limit } });
  if (ctx.policy.panelContractKindTaxonomyCode == null || ctx.policy.panelProjectStatusTaxonomyCode == null) out.push({ code: "LISTS_NOT_SET", level: "warn" });
  if (p.contractKindCode == null && !p.contractKindOther.trim()) out.push({ code: "KIND_NOT_SET", level: "block" });
  if (p.projectStatusCode == null && !p.projectStatusOther.trim()) out.push({ code: "STATUS_NOT_SET", level: "block" });
  if (p.bq == null) {
    if (ctx.bqRequired === true) out.push({ code: "BQ_NOT_NAMED", level: "block" });
  } else if (p.bq.status !== "FINALISED") out.push({ code: "BQ_NOT_FINALISED", level: "block" });
  if (p.liveSulitScans === 0) out.push({ code: "SCAN_REQUIRED", level: "block" });
  return out;
}

export type VerifyFault = "EXERCISE_CANCELLED" | "PACK_FROZEN" | "PERSON_REQUIRED" | "COLUMN_UNKNOWN" | "ALREADY_VERIFIED" | "DAY_REQUIRED" | "DAY_IN_FUTURE" | "TIME_ZONE_NOT_SET" | "PANEL_VERIFIED";

/// Recording one column's verification, attested on behalf of the Person named, on a day not after today.
export function verifyFaults(
  i: { columnCode: string; personId: string | null; verifiedOn: string | null },
  p: Pick<PanelFacts, "status" | "verifications">,
  ctx: { columns: readonly PanelColumn[]; today: string | null; exerciseStatus: ExerciseStatus },
): Finding<VerifyFault>[] {
  const out: Finding<VerifyFault>[] = [];
  const allows = exerciseAllowsPanel(ctx.exerciseStatus);
  if (allows !== "OPEN") out.push({ code: allows, level: "block" });
  if (p.status === "VERIFIED") out.push({ code: "PANEL_VERIFIED", level: "block" });
  if (!columnsInForce(ctx.columns, ctx.today).some((c) => c.code === i.columnCode)) out.push({ code: "COLUMN_UNKNOWN", level: "block" });
  else if (standingVerifications(p.verifications).some((v) => v.columnCode === i.columnCode)) out.push({ code: "ALREADY_VERIFIED", level: "block" });
  if (!i.personId) out.push({ code: "PERSON_REQUIRED", level: "block" });
  if (!i.verifiedOn) out.push({ code: "DAY_REQUIRED", level: "block" });
  else if (ctx.today == null) out.push({ code: "TIME_ZONE_NOT_SET", level: "block" });
  else if (i.verifiedOn > ctx.today) out.push({ code: "DAY_IN_FUTURE", level: "block" });
  return out;
}

/// Whether saving the panel's facts clears what was verified on them: any standing verification does.
export function editClearsVerifications(p: Pick<PanelFacts, "status" | "verifications">): boolean {
  return p.status === "VERIFIED" || standingVerifications(p.verifications).length > 0;
}

/// Editing the panel's facts is refused only on a cancelled exercise (a verified panel may be
/// edited: its verifications are cleared, audited, and it returns to a draft).
export function panelEditFault(exerciseStatus: ExerciseStatus): Finding<"EXERCISE_CANCELLED" | "PACK_FROZEN">[] {
  const allows = exerciseAllowsPanel(exerciseStatus);
  return allows !== "OPEN" ? [{ code: allows, level: "block" }] : [];
}
