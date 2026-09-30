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

const SKIP = new Set(["id", "organisationId", "exerciseId", "createdAt", "updatedAt", "issueSnapshot", "awardId", "contractId", "recipientId", "variantId", "templateId", "kindId", "issuerId", "signatoryDelegationId", "vendorId"]);
const MONEY = new Set(["awardedValue", "bondBasisAmount", "ladAmount", "value", "requiredValue", "basisAmount", "sumInsured", "appendixAmount", "requiredLimit", "contractSum", "limitAmount", "minValue", "maxValue"]);
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
export const awardAuditPair = (before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] => diffFields(awardAuditView(before), awardAuditView(after));
