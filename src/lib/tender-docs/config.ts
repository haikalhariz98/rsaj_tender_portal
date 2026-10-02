/**
 * Configuration › Tender documents (plan §5): which parts each pack kind assembles on each
 * basis, the policy values, and each method's document pack. Pure checks a save runs on
 * the rows it reads under the organisation's lock. Nothing is shipped set: an empty list
 * reads "No parts configured", and a setting not set says what it holds back.
 */

import { isPct, PCT_COLUMN, pctRefusal, type PctField } from "./percent";
import type { ConfiguredPart, Finding } from "./types";

export type PartConfigFault =
  | "CODE_REQUIRED"
  | "CODE_TAKEN"
  | "LABEL_REQUIRED"
  | "NUMBER_REQUIRED"
  | "BASIS_UNKNOWN"
  | "TEMPLATE_UNKNOWN"
  | "TEMPLATE_FOR_SOURCE"
  | "TEMPLATE_FOR_BESPOKE"
  | "UNIT_UNKNOWN"
  | "PROVENANCE_REQUIRED"
  | "RETURN_PROVENANCE_REQUIRED"
  | "ROLE_TAKEN";

/**
 * A part as saved: a code, a printed number and a label; a basis and a template that are
 * configured; a template only on a part drawn from the library, never on a bespoke one
 * (FR-DOC-003); and no second live part of the same role at the same reach (which would
 * the pack take?), OTHER excepted.
 */
export function partConfigFaults(
  p: Omit<ConfiguredPart, "retiredOn"> & { id?: string },
  ctx: { others: readonly (Pick<ConfiguredPart, "code" | "packKind" | "contractBasisCode" | "role" | "retiredOn"> & { id: string })[]; bases: readonly string[]; templates: readonly string[]; units: readonly string[]; today: string },
): Finding<PartConfigFault>[] {
  const out: Finding<PartConfigFault>[] = [];
  const f = (code: PartConfigFault, field: string) => out.push({ code, level: "block", data: { field } });
  if (!p.code.trim()) f("CODE_REQUIRED", "code");
  else if (!/^[a-z0-9_]+$/.test(p.code)) f("CODE_REQUIRED", "code");
  else if (ctx.others.some((o) => o.id !== p.id && o.code === p.code)) f("CODE_TAKEN", "code");
  if (!p.labelEn.trim()) f("LABEL_REQUIRED", "labelEn");
  if (!p.printedNumber.trim()) f("NUMBER_REQUIRED", "printedNumber");
  if (p.contractBasisCode && !ctx.bases.includes(p.contractBasisCode)) f("BASIS_UNKNOWN", "contractBasisCode");
  if (p.templateCode) {
    if (p.source !== "TEMPLATE") f("TEMPLATE_FOR_SOURCE", "templateCode");
    else if (p.content === "BESPOKE") f("TEMPLATE_FOR_BESPOKE", "templateCode");
    else if (!ctx.templates.includes(p.templateCode)) f("TEMPLATE_UNKNOWN", "templateCode");
  }
  if (p.ownerOrgUnitCode && !ctx.units.includes(p.ownerOrgUnitCode)) f("UNIT_UNKNOWN", "ownerOrgUnitCode");
  if (!p.provenance) f("PROVENANCE_REQUIRED", "provenance");
  // 6.7 (6.6 ruling): an answer on whether a bidder returns the part says where it came from.
  if (p.returnedByBidder != null && !p.returnedByBidderProvenance) f("RETURN_PROVENANCE_REQUIRED", "returnedByBidderProvenance");
  const live = (o: { retiredOn: string | null }) => o.retiredOn == null || o.retiredOn > ctx.today;
  if (p.role !== "OTHER" && ctx.others.some((o) => o.id !== p.id && live(o) && o.packKind === p.packKind && o.role === p.role && (o.contractBasisCode ?? null) === (p.contractBasisCode ?? null))) f("ROLE_TAKEN", "role");
  return out;
}

export const PART_CONFIG_FAULT_TEXT: Readonly<Record<PartConfigFault, string>> = {
  CODE_REQUIRED: "Give a code of lower-case letters, digits and underscores.",
  CODE_TAKEN: "That code is already in use.",
  LABEL_REQUIRED: "Give the part's name as printed.",
  NUMBER_REQUIRED: "Give the number it is printed under.",
  BASIS_UNKNOWN: "That contract basis is not configured. Choose one from the list, or none for every basis.",
  TEMPLATE_UNKNOWN: "That template is not configured. Choose one from the list.",
  TEMPLATE_FOR_SOURCE: "Only a part drawn from the template library names a template.",
  TEMPLATE_FOR_BESPOKE: "A bespoke part is prepared for each exercise, so it is never drawn from the library.",
  UNIT_UNKNOWN: "That office is not configured. Choose one from the list.",
  PROVENANCE_REQUIRED: "Say where this comes from.",
  RETURN_PROVENANCE_REQUIRED: "Say where the answer on whether a bidder returns this part comes from.",
  ROLE_TAKEN: "Another live part of this pack kind and basis already has this role. Retire it first, or give this one another basis.",
};

export type PolicyFault = "PCT_NOT_VALID" | "AMOUNT_NOT_VALID" | "PERIOD_NOT_VALID" | "PROVENANCE_REQUIRED" | "PAIR_INCOMPLETE";

/**
 * The policy as saved. A value given needs where it comes from; a pair (floor and
 * percentage; months and days) is set whole or not at all, so a half-set rule never reads
 * as set. Each percentage within its column's places and below its bound; periods whole
 * and not negative.
 */
export function policyFaults(p: {
  ladDailyPct: string | null;
  ladDailyPctProvenance: string | null;
  firstCertificateFloor: string | null;
  firstCertificatePct: string | null;
  firstCertificateProvenance: string | null;
  insuranceExtraMonths: number | null;
  insuranceExtraDays: number | null;
  insuranceExtraProvenance: string | null;
  dbInsuranceExtraMonths: number | null;
  dbInsuranceExtraDays: number | null;
  dbInsuranceExtraProvenance: string | null;
}): Finding<PolicyFault>[] {
  const out: Finding<PolicyFault>[] = [];
  const f = (code: PolicyFault, field: string) => out.push({ code, level: "block", data: { field } });
  if (p.ladDailyPct != null) {
    if (!isPct(p.ladDailyPct, PCT_COLUMN.ladDailyPct)) f("PCT_NOT_VALID", "ladDailyPct");
    if (!p.ladDailyPctProvenance) f("PROVENANCE_REQUIRED", "ladDailyPctProvenance");
  }
  if ((p.firstCertificateFloor == null) !== (p.firstCertificatePct == null)) f("PAIR_INCOMPLETE", p.firstCertificateFloor == null ? "firstCertificateFloor" : "firstCertificatePct");
  if (p.firstCertificatePct != null && !isPct(p.firstCertificatePct, PCT_COLUMN.firstCertificatePct)) f("PCT_NOT_VALID", "firstCertificatePct");
  if ((p.firstCertificateFloor != null || p.firstCertificatePct != null) && !p.firstCertificateProvenance) f("PROVENANCE_REQUIRED", "firstCertificateProvenance");
  for (const [m, d, prov, key] of [
    [p.insuranceExtraMonths, p.insuranceExtraDays, p.insuranceExtraProvenance, "insuranceExtra"],
    [p.dbInsuranceExtraMonths, p.dbInsuranceExtraDays, p.dbInsuranceExtraProvenance, "dbInsuranceExtra"],
  ] as const) {
    if ((m == null) !== (d == null)) f("PAIR_INCOMPLETE", m == null ? `${key}Months` : `${key}Days`);
    if ((m != null && (m < 0 || !Number.isInteger(m))) || (d != null && (d < 0 || !Number.isInteger(d)))) f("PERIOD_NOT_VALID", `${key}Months`);
    if ((m != null || d != null) && !prov) f("PROVENANCE_REQUIRED", `${key}Provenance`);
  }
  return out;
}

export const POLICY_FAULT_TEXT: Readonly<Record<PolicyFault, string>> = {
  /// Worded per field by `policyFaultText`, from the field's column.
  PCT_NOT_VALID: "Give a percentage.",
  AMOUNT_NOT_VALID: "Give an amount in ringgit and sen.",
  PERIOD_NOT_VALID: "Give whole months and days, not negative.",
  PROVENANCE_REQUIRED: "Say where this value comes from.",
  PAIR_INCOMPLETE: "Set both halves of this rule, or neither.",
};

/// The policy's percentage fields, as the form labels them.
const POLICY_PCT_LABEL: Readonly<Record<Extract<PctField, "ladDailyPct" | "firstCertificatePct">, string>> = {
  ladDailyPct: "The liquidated damages rate",
  firstCertificatePct: "The first certificate's percentage",
};

/// A policy finding's text. A percentage names its bound and places, from its column.
export function policyFaultText(f: Finding<PolicyFault>): string {
  const field = String(f.data?.field ?? "");
  if (f.code === "PCT_NOT_VALID" && (field === "ladDailyPct" || field === "firstCertificatePct")) return pctRefusal(POLICY_PCT_LABEL[field], PCT_COLUMN[field]);
  return POLICY_FAULT_TEXT[f.code];
}

/**
 * Whether a configured part is retired on the organisation's day: retired from that day or
 * earlier (a pack started that day does not take it, as `resolveComposition` reads it).
 * The day is the organisation's, never UTC's: with its time zone unset there is no day, so
 * a part with a retirement day cannot be judged and reads `null` (not known), never a guess.
 */
export function partRetiredOn(retiredOn: string | null, today: string | null): boolean | null {
  if (retiredOn == null) return false;
  if (today == null) return null;
  return retiredOn <= today;
}

/**
 * How many settings hold work back (62-C4's rule for the header): a method in use whose
 * document pack is not set (its exercises cannot move into preparation), and a part not
 * retired whose "mandatory" is not set, and each whose "in the Tender Table Document" is not
 * set (a pack on it cannot be submitted; each is a setting of its own). A part whose
 * retirement cannot be judged (time zone unset) is counted: it may still hold work back.
 */
export function configHoldingWorkBack(methods: readonly { retired: boolean; documentPackKind: string | null }[], parts: readonly { retiredOn: string | null; mandatory: boolean | null; inTableDocument?: boolean | null }[], today: string | null): number {
  const held = parts.filter((p) => partRetiredOn(p.retiredOn, today) !== true);
  return methods.filter((m) => !m.retired && m.documentPackKind == null).length + held.filter((p) => p.mandatory == null).length + held.filter((p) => p.inTableDocument === null).length;
}

/// Said where the organisation's day is needed and its time zone is not set (names the setting).
export const CONFIG_TIME_ZONE_NOT_SET = "The organisation's time zone is not set, so whether a part's retirement has taken effect cannot be judged. Set it under Configuration, Organisation.";

/// A method's document pack, as saved: the kind and where that answer comes from, or not set.
export function methodPackFault(kind: string | null, provenance: string | null): Finding<"PROVENANCE_REQUIRED"> | null {
  return kind != null && !provenance ? { code: "PROVENANCE_REQUIRED", level: "block", data: { field: "documentPackKindProvenance" } } : null;
}
