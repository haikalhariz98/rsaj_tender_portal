/**
 * An exercise as its audit trail records it (UX 4, ruling on BD-16). Pure, so the
 * actions and the demo loader write the same shape.
 *
 * Money and shares are normalised so an unchanged figure never reads as a change; ids
 * are left out. The approval matrix issue, the appointment rule and the terms band are
 * compared on their id or key and shown by their label (labels need not be unique).
 */

import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { parseSen, senToDecimalString } from "@/lib/money";

import { issueAuditNames, keyedAuditNames } from "./drift";

const AUDIT_SKIP = new Set([
  "bandSnapshot", "bandWarnings", "classificationSnapshot", "proposalRecord", "determinedAt", "authorityMatrixId", "updatedAt", "createdAt", "id", "organisationId",
  "requisitionId", "appointmentRuleKey", "termsBandKey", "requisitionRuleKey", "matrixLabel",
  // 6.4: written on the move into preparation with its label (`documentPack`), never its code.
  "packKindSnapshot",
]);
const MONEY = new Set(["estimatedValue", "boundaryValue"]);

const isDecimal = (v: unknown) => v != null && typeof v === "object" && "toFixed" in (v as object);

export function auditView(x: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (AUDIT_SKIP.has(k)) continue;
    if (isDecimal(v) || ((typeof v === "string" || typeof v === "number") && (MONEY.has(k) || k === "dominantSharePct"))) {
      out[k] = k === "dominantSharePct" ? Number(String(v)).toFixed(4) : senToDecimalString(parseSen(String(v)));
    } else if (v != null && typeof v === "object" && !(v instanceof Date)) {
      // Related rows (scope lines, routes) are audited as rows of their own.
      continue;
    } else out[k] = v;
  }
  return out;
}

/// The appointment rule and terms band an exercise was determined under: keyed by the
/// rule and band keys, named from the band snapshot (6.3 re-review).
function banded(x: Record<string, unknown>) {
  const snap = (x.bandSnapshot ?? null) as { appointment?: { ruleLabel?: string | null }; terms?: { label?: string | null } } | null;
  return {
    rule: { key: x.appointmentRuleKey as string | null | undefined, label: snap?.appointment?.ruleLabel },
    terms: { key: x.termsBandKey as string | null | undefined, label: snap?.terms?.label },
  };
}

/// The named fields compared on their keys: the issue, the appointment rule, the terms band.
function named(before: Record<string, unknown> | null, after: Record<string, unknown>): FieldChange[] {
  const out: FieldChange[] = [];
  const b = before ? banded(before) : null;
  const a = banded(after);
  const rule = keyedAuditNames(b?.rule ?? null, a.rule, "rule");
  const terms = keyedAuditNames(b?.terms ?? null, a.terms, "terms band");
  const issue = issueAuditNames(before as IssueCols | null, after as IssueCols);
  const push = (field: string, r: { before: string | null; after: string | null }, changed: boolean) => {
    if (before == null ? r.after != null : changed) out.push({ field, before: r.before, after: r.after });
  };
  push("appointmentRule", rule, rule.changed);
  push("termsBand", terms, terms.changed);
  push("approvalMatrixIssue", issue, (before?.authorityMatrixId ?? null) !== (after.authorityMatrixId ?? null));
  return out;
}

type IssueCols = { authorityMatrixId?: string | null; matrixLabel?: string | null };

/// A new exercise's trail entry: what it was given, the issue by its label.
export function auditCreate(row: Record<string, unknown>, extra: Record<string, unknown> = {}): FieldChange[] {
  return [...diffFields(null, auditView(row)), ...named(null, row), ...diffFields(null, extra)];
}

/// Before and after as the trail shows them; `after` is the whole row as written.
export function auditPair(before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  return [...diffFields(auditView(before), auditView(after)), ...named(before, after)];
}
