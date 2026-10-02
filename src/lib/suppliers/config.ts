/**
 * Configuration › Supplier register (6.15 §5): the registration bodies' value lists (FR-VND-003), the
 * document types (FR-VND-002), the register's own lists (entity types, countries) and the register's
 * policy. Nothing ships (AGENTS.md rule 1): the published CIDB/MOF lists are an RSAJ go-live seed and a
 * test fixture only (6.4 Q-8 precedent). Each saved value carries where it comes from. Pure.
 */

import { fitsMoneyColumn, MoneyFormatError, parseSen } from "@/lib/money";

import type { Finding, RegistrationValueKind } from "./types";

export type ConfigFault =
  | "CODE_REQUIRED"
  | "CODE_TAKEN"
  | "NAME_REQUIRED"
  | "PROVENANCE_REQUIRED"
  | "BODY_NOT_CONFIGURED"
  | "VALUE_KIND_REQUIRED"
  | "PARENT_NOT_CATEGORY"
  | "PARENT_ONLY_FOR_SPECIALISATION"
  | "RANK_ONLY_FOR_GRADE"
  | "RANK_NOT_VALID"
  | "RANK_TAKEN"
  | "CEILING_ONLY_FOR_GRADE"
  | "CEILING_NOT_VALID"
  | "CEILING_PROVENANCE_REQUIRED"
  | "KINDS_WITHOUT_BODY"
  | "KIND_NOT_LISTED"
  | "REASON_REQUIRED";

export interface ValueInput {
  kind: RegistrationValueKind | null;
  code: string;
  nameEn: string;
  /// The category a specialisation sits under (its code). Only a specialisation takes one.
  parentCode: string | null;
  /// A grade's place in the body's order: the higher, the more it covers. Configuration, never inferred from a code.
  rank: number | null;
  /// The grade's value ceiling as the body publishes it, shown only (OD-10 A), with its provenance.
  valueCeiling: string | null;
  ceilingProvenance: string | null;
  provenance: string | null;
}

/**
 * A registration value under a body (FR-VND-003): a kind; a parent category only for a
 * specialisation; a rank and a ceiling only for a grade, the rank unique among the body's grades.
 */
export function valueFaults(v: ValueInput, ctx: { bodyExists: boolean; codeTaken: boolean; categoryCodes: readonly string[]; gradeRanks: readonly number[] }): Finding<ConfigFault>[] {
  const out: Finding<ConfigFault>[] = [];
  const add = (code: ConfigFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!ctx.bodyExists) return [{ code: "BODY_NOT_CONFIGURED", level: "block" }];
  if (!v.kind) add("VALUE_KIND_REQUIRED");
  if (!v.code.trim()) add("CODE_REQUIRED");
  else if (ctx.codeTaken) add("CODE_TAKEN");
  if (!v.nameEn.trim()) add("NAME_REQUIRED");
  if (!v.provenance) add("PROVENANCE_REQUIRED");
  if (v.parentCode) {
    if (v.kind !== "SPECIALISATION") add("PARENT_ONLY_FOR_SPECIALISATION");
    else if (!ctx.categoryCodes.includes(v.parentCode)) add("PARENT_NOT_CATEGORY");
  }
  if (v.rank != null) {
    if (v.kind !== "GRADE") add("RANK_ONLY_FOR_GRADE");
    else if (!Number.isInteger(v.rank) || v.rank < 1) add("RANK_NOT_VALID");
    else if (ctx.gradeRanks.includes(v.rank)) add("RANK_TAKEN", { rank: v.rank });
  }
  if (v.valueCeiling) {
    if (v.kind !== "GRADE") add("CEILING_ONLY_FOR_GRADE");
    else {
      try {
        const sen = parseSen(v.valueCeiling);
        if (sen <= 0n || !fitsMoneyColumn(sen)) add("CEILING_NOT_VALID");
      } catch (e) {
        if (!(e instanceof MoneyFormatError)) throw e;
        add("CEILING_NOT_VALID");
      }
      if (!v.ceilingProvenance) add("CEILING_PROVENANCE_REQUIRED");
    }
  }
  return out;
}

export interface DocumentTypeInput {
  code: string;
  nameEn: string;
  bodyId: string | null;
  valueKinds: readonly RegistrationValueKind[];
  provenance: string | null;
}

/// A document type (FR-VND-002): named, its values only of a body it names. Its three switches may be left not set: each then blocks the act it governs.
export function documentTypeFaults(t: DocumentTypeInput, ctx: { codeTaken: boolean; bodyExists: boolean }): Finding<ConfigFault>[] {
  const out: Finding<ConfigFault>[] = [];
  if (!t.code.trim()) out.push({ code: "CODE_REQUIRED", level: "block" });
  else if (ctx.codeTaken) out.push({ code: "CODE_TAKEN", level: "block" });
  if (!t.nameEn.trim()) out.push({ code: "NAME_REQUIRED", level: "block" });
  if (!t.provenance) out.push({ code: "PROVENANCE_REQUIRED", level: "block" });
  if (t.bodyId && !ctx.bodyExists) out.push({ code: "BODY_NOT_CONFIGURED", level: "block" });
  if (t.valueKinds.length && !t.bodyId) out.push({ code: "KINDS_WITHOUT_BODY", level: "block" });
  return out;
}

/// An entry on one of the register's lists (entity types, countries).
export function listValueFaults(v: { code: string; nameEn: string; provenance: string | null }, ctx: { codeTaken: boolean; kindListed: boolean }): Finding<ConfigFault>[] {
  const out: Finding<ConfigFault>[] = [];
  if (!ctx.kindListed) out.push({ code: "KIND_NOT_LISTED", level: "block" });
  if (!v.code.trim()) out.push({ code: "CODE_REQUIRED", level: "block" });
  else if (ctx.codeTaken) out.push({ code: "CODE_TAKEN", level: "block" });
  if (!v.nameEn.trim()) out.push({ code: "NAME_REQUIRED", level: "block" });
  if (!v.provenance) out.push({ code: "PROVENANCE_REQUIRED", level: "block" });
  return out;
}
