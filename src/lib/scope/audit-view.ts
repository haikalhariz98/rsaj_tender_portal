/**
 * What 6.2's audit rows record, as field changes. Pure, so the shape is tested once and
 * the actions and the demo write the same rows.
 *
 * The sealed-figure rule: an estimate version's row reads "Sealed (version N)" where the
 * figure and the amendment reason would be, and carries neither. `historyChange` applies the
 * same rule when the History tab renders any row of the estimate's entities, so even a row
 * written some other way never shows a figure.
 *
 * Every named person is "recorded on behalf of, not signed". Money in the bill's rows is
 * formatted (the bill is not SULIT, OD-8); codes are rendered as labels.
 */

import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { formatSen, type Sen } from "@/lib/money";

import { itemAmount } from "./bq";
import { ATTESTED, BQ_STATUS_LABEL, EVENT_KIND_LABEL, ITEM_KIND_LABEL, sealedVersion, SCOPED_BY_LABEL } from "./labels";
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
} as const;

/// The entities whose rows are labelled `${exercise reference} · …`, for the exercise's History.
export const SCOPE_ENTITIES: readonly string[] = Object.values(ENTITY);

const named = (name: string | null | undefined) => (name ? `${name} (${ATTESTED})` : null);

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
}

const itemFields = (i: ItemAuditFacts) => ({
  item: i.itemRef || null,
  description: i.description,
  unit: i.unit || null,
  kind: ITEM_KIND_LABEL[i.kind],
  quantity: i.quantity,
  rate: i.rate == null ? null : formatSen(i.rate),
  amount: (() => {
    const a = itemAmount(i.quantity, i.rate);
    return a == null ? null : formatSen(a);
  })(),
  provisional: i.provisional,
});

export const itemAudit = (before: ItemAuditFacts | null, after: ItemAuditFacts): FieldChange[] => diffFields(before ? itemFields(before) : null, itemFields(after));

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

// ------------------------------------------------------------------ panel

export function verificationAudit(i: { column: string; personName: string; verifiedOn: string; note: string }): FieldChange[] {
  return diffFields(null, { column: i.column, verifiedBy: named(i.personName), verifiedOn: i.verifiedOn, ...(i.note ? { note: i.note } : {}) });
}

export function verificationClearedAudit(i: { column: string; personName: string }): FieldChange[] {
  return diffFields({ column: i.column, verifiedBy: named(i.personName), cleared: "no" }, { column: i.column, verifiedBy: named(i.personName), cleared: "yes, the panel was edited after" });
}
