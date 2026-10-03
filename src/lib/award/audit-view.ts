/**
 * An award and what is under it, as the audit trail records them. Pure, so the actions
 * and the demo loader write the same shape.
 *
 * Money and percentages are normalised so an unchanged figure never reads as a change;
 * ids, snapshots and timestamps the trail does not need are left out. The contractor's
 * IC number enters the trail masked: the trail never holds it in full (6.11 ruling,
 * build decision BD-9).
 */

import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { parseSen, senToDecimalString } from "@/lib/money";

import { maskIc } from "./mask";

/// Ids are skipped: a trail reads names. The awardee's party (6.7 C-7) is written by the actions as
/// `awardeeBidder`, the bidder's name and registration (review R-7), never its id.
const SKIP = new Set(["id", "organisationId", "exerciseId", "createdAt", "updatedAt", "issueSnapshot", "awardId", "contractId", "recipientId", "variantId", "templateId", "kindId", "issuerId", "signatoryDelegationId", "vendorId", "awardeePartyId"]);
const MONEY = new Set(["awardedValue", "bondBasisAmount", "ladAmount", "value", "requiredValue", "basisAmount", "sumInsured", "appendixAmount", "requiredLimit", "contractSum", "limitAmount", "minValue", "maxValue", "worksSumInsured", "liabilitySumInsured", "wcSumInsured"]);
const PCT = new Set(["bondPercent", "retentionPercent", "retentionCapPercent", "basisPercent", "percent"]);

const isDecimal = (v: unknown) => v != null && typeof v === "object" && "toFixed" in (v as object);

export function awardAuditView(x: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (SKIP.has(k) || v === undefined) continue;
    if (k === "icNumber") out[k] = maskIc(v as string | null);
    else if (v != null && MONEY.has(k)) out[k] = senToDecimalString(parseSen(String(v)));
    else if (v != null && PCT.has(k)) out[k] = Number(String(v)).toFixed(4);
    else if (isDecimal(v)) out[k] = String(v);
    else if (v != null && typeof v === "object" && !(v instanceof Date)) continue;
    else out[k] = v;
  }
  return out;
}

export const awardAuditCreate = (row: Record<string, unknown>, extra: Record<string, unknown> = {}): FieldChange[] => [...diffFields(null, awardAuditView(row)), ...diffFields(null, extra)];
/**
 * Masking comes before the diff, so two numbers ending in the same four digits would
 * read as no change. Where the raw numbers differ the change is recorded all the same,
 * still masked: "changed (••••••••1234)".
 */
export function awardAuditPair(before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  const b = awardAuditView(before);
  const a = awardAuditView(after);
  const raw = (x: unknown) => String(x ?? "").trim();
  if ("icNumber" in after && raw(before.icNumber) !== raw(after.icNumber) && b.icNumber === a.icNumber) a.icNumber = `changed (${a.icNumber})`;
  return diffFields(b, a);
}
