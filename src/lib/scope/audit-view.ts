/**
 * What 6.2's audit rows record, as field changes. Pure, so the shape is tested once and
 * the actions and the demo write the same rows.
 *
 * The sealed-figure rule: an estimate version's row reads "Sealed (version N)" where the
 * figure and the amendment reason would be, and carries neither. `historyChange` applies the
 * same rule when the History tab renders any row of the estimate's entities, so even a row
 * written some other way never shows a figure.
 *
 * Every named person is named, and nothing is said of how the act was recorded: that is its attribution (Phase 2b). Money in the bill's rows is
 * formatted (the bill is not SULIT, OD-8); codes are rendered as labels.
 */

import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { storedDay } from "@/lib/dates";
import { formatSen, type Sen } from "@/lib/money";

import { itemAmount, type BqTotals } from "./bq";
import { BQ_STATUS_LABEL, EVENT_KIND_LABEL, firmValueText, ITEM_KIND_LABEL, sealedVersion, SCOPED_BY_LABEL } from "./labels";
import type { BqItemKind, BqScopedBy, BqStatus, EstimateEventKind } from "./types";

export const ENTITY = {
  bqVersion: "BqVersion",
  bqSection: "BqSection",
  bqItem: "BqItem",
  panel: "SpecificationPanel",
  verification: "SpecPanelVerification",
  estimate: "CompanyEstimate",
  estimateVersion: "CompanyEstimateVersion",
  estimateEvent: "EstimateEvent",
  /// Increment 2: a bill exported as CSV (no row of its own: the trail is the record of it).
  bqExport: "BqCsvExport",
} as const;

/// What each 6.2 record is called in a History list (codes never reach a screen).
export const SCOPE_ENTITY_LABEL: Readonly<Record<string, string>> = {
  [ENTITY.bqVersion]: "Bill of quantities",
  [ENTITY.bqSection]: "Bill section",
  [ENTITY.bqItem]: "Bill line",
  [ENTITY.panel]: "Specification panel",
  [ENTITY.verification]: "Panel verification",
  [ENTITY.estimate]: "Company estimate",
  [ENTITY.estimateVersion]: "Company estimate version",
  [ENTITY.estimateEvent]: "Company estimate custody",
  [ENTITY.bqExport]: "Bill exported",
  CommitteeDecision: "Committee matter",
  RateSchedule: "Schedule of rates",
  RateScheduleItem: "Schedule of rates item",
};

/// Increment 2: schedules of rates are configuration, labelled by their own name, not an exercise's.
export const RATE_ENTITY = { schedule: "RateSchedule", item: "RateScheduleItem" } as const;

/// The entities whose rows are labelled `${exercise reference} · …`, for the exercise's History.
export const SCOPE_ENTITIES: readonly string[] = Object.values(ENTITY);

const named = (name: string | null | undefined) => (name ? name : null);

// ------------------------------------------------------------------ estimate

/// A version prepared or amended: its number, who and when. Never the figure, never the reason.
export function estimateVersionAudit(i: { versionNo: number; preparerName: string; preparedOn: string }): FieldChange[] {
  return diffFields(null, {
    version: i.versionNo,
    value: sealedVersion(i.versionNo),
    ...(i.versionNo > 1 ? { reason: sealedVersion(i.versionNo) } : {}),
    preparedBy: named(i.preparerName),
    preparedOn: i.preparedOn,
  });
}

/// The estimate started: its preparer and its classification.
export function estimateCreatedAudit(i: { preparerName: string; classification: string }): FieldChange[] {
  return diffFields(null, { preparer: named(i.preparerName), classification: i.classification, state: "Being prepared" });
}

/// A custody or lifecycle event (lodged, retained, voided). The void reason is why the preparer could not continue: no figure.
export function estimateEventAudit(i: { kind: EstimateEventKind; personName: string | null; capacity?: string; versionNo?: number | null; copyNo?: number | null; place?: string; reason?: string }): FieldChange[] {
  return diffFields(null, {
    event: EVENT_KIND_LABEL[i.kind],
    by: named(i.personName),
    ...(i.capacity ? { capacity: i.capacity } : {}),
    ...(i.versionNo != null ? { version: i.versionNo } : {}),
    ...(i.copyNo != null ? { copy: i.copyNo } : {}),
    ...(i.place ? { keptAt: i.place } : {}),
    ...(i.reason ? { reason: i.reason } : {}),
  });
}

export function estimateStateAudit(before: string, after: string): FieldChange[] {
  return diffFields({ state: before }, { state: after });
}

/**
 * How the History renders one change of a row: for the estimate's version entity, a field
 * named for the figure or the reason reads "Sealed (version N)" whatever the row holds.
 */
export function historyChange(entity: string, change: FieldChange, versionNo: number | null): FieldChange {
  if (entity !== ENTITY.estimateVersion) return change;
  if (!/^(value|reason|amount|figure)$/i.test(change.field)) return change;
  const sealed = versionNo == null ? "Sealed" : sealedVersion(versionNo);
  return { field: change.field, before: change.before == null ? null : sealed, after: change.after == null ? null : sealed };
}

// ------------------------------------------------------------------ bill of quantities

export interface ItemAuditFacts {
  itemRef: string;
  description: string;
  unit: string;
  kind: BqItemKind;
  quantity: string | null;
  rate: Sen | null;
  provisional: boolean;
  /// FR-EST-004: where the rate came from a schedule, the issue as the line keeps it (`rateFromText`).
  rateFrom?: string | null;
}

const itemFields = (i: ItemAuditFacts) => ({
  ...(i.rateFrom !== undefined ? { rateFrom: i.rateFrom ?? "Entered" } : {}),
  item: i.itemRef || null,
  description: i.description,
  unit: i.unit || null,
  kind: ITEM_KIND_LABEL[i.kind],
  quantity: i.quantity,
  // The priced figures are SULIT (Phase 3b): kept under their registered keys, which History judges and the audit export withholds. Rows written before this carry "rate" and "amount", read by `sulitFieldOf`.
  bqRate: i.rate == null ? null : formatSen(i.rate),
  bqAmount: (() => {
    const a = itemAmount(i.quantity, i.rate);
    return a == null ? null : formatSen(a);
  })(),
  provisional: i.provisional,
});

export const itemAudit = (before: ItemAuditFacts | null, after: ItemAuditFacts): FieldChange[] => diffFields(before ? itemFields(before) : null, itemFields(after));

/// What a schedule-priced line keeps, in words: the schedule, the issue, the day it took effect and the item.
/// `supersededOn`: the day a later issue replaced this one. The line keeps its price (FR-EST-004),
/// and says so, rather than reading as if the issue were still the one in force.
export const rateFromText = (s: { label: string; issue: string; effectiveFrom: string; itemCode: string; supersededOn?: string | null }, formatDay: (d: string) => string) =>
  `${s.label}, ${s.issue} (in force from ${formatDay(s.effectiveFrom)}${s.supersededOn ? `, superseded on ${formatDay(s.supersededOn)}; the line keeps this price` : ""}), item ${s.itemCode}`;

/// A bill's CSV import: the file, what it added, and what it reported.
export function bqImportAudit(i: { file: string; documentTitle: string; versionNo: number; sha256: string; sections: number; lines: number; replacedLines: number; mismatches: number; priced: boolean }): FieldChange[] {
  return diffFields(null, {
    importedFrom: i.file,
    document: i.documentTitle,
    documentVersion: i.versionNo,
    fingerprint: i.sha256,
    sections: i.sections,
    lines: i.lines,
    ...(i.replacedLines ? { linesReplaced: i.replacedLines } : {}),
    priced: i.priced ? "Yes" : "No, rates to be entered",
    amountsThatDiffered: i.mismatches,
  });
}

/// A bill's CSV export: which version, priced or not, the file's name and its digest. Never a figure.
export function bqExportAudit(i: { versionNo: number; priced: boolean; fileName: string; sha256: string; lines: number }): FieldChange[] {
  return diffFields(null, { version: i.versionNo, file: i.fileName, priced: i.priced ? "Priced" : "Unpriced", lines: i.lines, fingerprint: i.sha256 });
}

/// A scope matter tabled: what, where, by whom ("recorded on behalf of, not signed").
export function scopeTabledAudit(i: { subject: string; versionNo: number; sitting: string; committee: string; act: string; tabledBy: string | null; tabledOn: string }): FieldChange[] {
  return diffFields(null, { subject: i.subject, matter: "Scope approval", bill: `version ${i.versionNo}`, sitting: i.sitting, committee: i.committee, act: i.act, tabledBy: named(i.tabledBy), tabledOn: i.tabledOn });
}

export const sectionAudit = (before: { number: string; title: string } | null, after: { number: string; title: string }): FieldChange[] => diffFields(before, after);

export function bqHeaderAudit(
  before: { scopedBy: BqScopedBy | null; scopeStatement: string; followsStandard: boolean | null; departuresText: string; preparerName: string | null; provisionalExcludedFromFirm: boolean | null } | null,
  after: { scopedBy: BqScopedBy | null; scopeStatement: string; followsStandard: boolean | null; departuresText: string; preparerName: string | null; provisionalExcludedFromFirm: boolean | null },
): FieldChange[] {
  const view = (h: NonNullable<typeof before>) => ({
    scopedBy: h.scopedBy ? SCOPED_BY_LABEL[h.scopedBy] : null,
    scopeStatement: h.scopeStatement,
    followsStandard: h.followsStandard,
    departures: h.departuresText,
    preparer: named(h.preparerName),
    provisionalLeftOutOfFirmValue: h.provisionalExcludedFromFirm,
  });
  return diffFields(before ? view(before) : null, view(after));
}

export function bqStatusAudit(before: BqStatus | null, after: BqStatus, extra: Record<string, unknown> = {}): FieldChange[] {
  return diffFields(before ? { status: BQ_STATUS_LABEL[before] } : null, { status: BQ_STATUS_LABEL[after], ...extra });
}

/// Finalising a draft: its totals as money in words (never raw decimals), the standard and the preparer's qualification.
export function bqFinalisedAudit(t: Pick<BqTotals, "total" | "buildersWorks" | "firmValue">, i: { standard: string | null; preparerQualification: string | null }): FieldChange[] {
  return bqStatusAudit("DRAFT", "FINALISED", { bqTotals: formatSen(t.total), bqBuildersWorks: formatSen(t.buildersWorks), bqFirmValue: firmValueText(t.firmValue), standard: i.standard, preparerQualification: i.preparerQualification });
}

// ------------------------------------------------------------------ panel

/// The name a value of a configured list is recorded under, never its code; a code no longer on the list says so.
export function listValueLabel(values: readonly { code: string; nameEn: string }[], code: string | null): string | null {
  if (code == null) return null;
  return values.find((v) => v.code === code)?.nameEn ?? "A value no longer on the list";
}

/// The panel's facts as its trail records them: list values by name (`listValueLabel`), days as days.
export interface PanelAuditFacts {
  contractKind: string | null;
  contractKindOther: string;
  projectStatus: string | null;
  projectStatusOther: string;
  currentRevisionNo: string | null;
  currentRevisionOn: Date | null;
  revisedRevisionNo: string | null;
  revisedRevisionOn: Date | null;
  completionPeriodText: string;
  bqVersionNo: number | null;
}

/// Saving the panel: each fact that changed, before and after (all of them on creation).
export function panelAudit(before: PanelAuditFacts | null, after: PanelAuditFacts): FieldChange[] {
  const view = (p: PanelAuditFacts) => ({
    contractKind: p.contractKind, contractKindSpecified: p.contractKindOther || null, projectStatus: p.projectStatus, projectStatusSpecified: p.projectStatusOther || null,
    currentRevision: p.currentRevisionNo, currentRevisionOn: p.currentRevisionOn, revisedRevision: p.revisedRevisionNo, revisedRevisionOn: p.revisedRevisionOn,
    completionPeriod: p.completionPeriodText || null, certifiesBill: p.bqVersionNo == null ? null : `version ${p.bqVersionNo}`,
  });
  const b = before ? view(before) : null;
  const a = view(after);
  const s = (v: unknown) => (v == null ? null : v instanceof Date ? storedDay(v) : String(v));
  return (Object.keys(a) as (keyof typeof a)[]).flatMap((k) => {
    const x = s(b ? b[k] : null);
    const y = s(a[k]);
    return x === y ? [] : [{ field: k, before: x, after: y }];
  });
}

export function verificationAudit(i: { column: string; personName: string; verifiedOn: string; note: string }): FieldChange[] {
  return diffFields(null, { column: i.column, verifiedBy: named(i.personName), verifiedOn: i.verifiedOn, ...(i.note ? { note: i.note } : {}) });
}

export function verificationClearedAudit(i: { column: string; personName: string }): FieldChange[] {
  return diffFields({ column: i.column, verifiedBy: named(i.personName), cleared: "no" }, { column: i.column, verifiedBy: named(i.personName), cleared: "yes, the panel was edited after" });
}
