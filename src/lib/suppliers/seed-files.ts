/**
 * Judging the files a customer supplies to load its registration lists (Phase 4b): the work codes of the bodies it registers under (MOF, CIDB, SPAN, the Energy Commission), and the banks and
 * account types. The product ships none of them (AGENTS.md rule 1); `prisma/rsaj/registration-seed.ts` reads the customer's own files and asks this what to make of each row.
 *
 * Everything is judged before anything is written, and one row refused refuses the whole file: a list loaded part-way is a list nobody can trust. A row with no name is refused (a code
 * with no name would be shown to a supplier as a bare key), and so is a row that does not say where it comes from. A code already on the register is skipped, never changed: an existing
 * value may be in use, and changing it is an edit an officer makes, with a reason. Pure.
 */

import { listValueFaults, valueFaults } from "./config";
import { REGISTRATION_VALUE_KINDS, type RegistrationValueKind } from "./types";

const PROVENANCES = ["STATED", "OBSERVED", "ASSUMED"] as const;
export type SeedProvenance = (typeof PROVENANCES)[number];

export interface SeedValue {
  bodyCode: string;
  kind: RegistrationValueKind;
  code: string;
  nameEn: string;
  nameMs: string | null;
  parentCode: string | null;
  rank: number | null;
  valueCeiling: string | null;
  ceilingProvenance: SeedProvenance | null;
  governingSource: string;
  provenance: SeedProvenance;
}

export interface SeedListEntry {
  list: "BANK" | "ACCOUNT_TYPE";
  code: string;
  nameEn: string;
  nameMs: string | null;
  governingSource: string;
  provenance: SeedProvenance;
}

export interface Judged<T> {
  /// The rows to write, in the file's order.
  rows: T[];
  /// Rows already on the register, left as they are.
  skipped: number;
  /// What stops the file. Empty when it may be loaded.
  errors: string[];
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const optional = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const provenanceOf = (v: unknown): SeedProvenance | null => (typeof v === "string" && (PROVENANCES as readonly string[]).includes(v) ? (v as SeedProvenance) : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/// The values file: an array of rows. `existing` is what the register already holds, by body, kind and code.
export function judgeValueFile(raw: unknown, ctx: { bodyCodes: readonly string[]; existing: readonly { bodyCode: string; kind: string; code: string; rank: number | null }[] }): Judged<SeedValue> {
  const out: Judged<SeedValue> = { rows: [], skipped: 0, errors: [] };
  if (!Array.isArray(raw)) return { ...out, errors: ["The file must be a list of rows."] };
  const seen = new Set<string>();
  const ranks = new Map<string, number[]>();
  for (const e of ctx.existing) if (e.rank != null) ranks.set(e.bodyCode, [...(ranks.get(e.bodyCode) ?? []), e.rank]);
  const categories = new Map<string, string[]>();
  for (const e of ctx.existing) if (e.kind === "CATEGORY") categories.set(e.bodyCode, [...(categories.get(e.bodyCode) ?? []), e.code]);
  // A category named earlier in the file is a parent for a specialisation later in it.
  raw.forEach((r) => {
    if (!isRecord(r)) return;
    if (r.kind === "CATEGORY" && typeof r.bodyCode === "string" && typeof r.code === "string") categories.set(r.bodyCode, [...(categories.get(r.bodyCode) ?? []), r.code.trim()]);
  });
  raw.forEach((r, i) => {
    const at = `Row ${i + 1}`;
    if (!isRecord(r)) {
      out.errors.push(`${at}: not a row.`);
      return;
    }
    const nameEn = text(r.nameEn);
    const code = text(r.code);
    const bodyCode = text(r.bodyCode);
    const label = `${at}${code ? ` (${code})` : ""}`;
    if (!nameEn) {
      out.errors.push(`${label}: it has no name. A code with no name is never loaded.`);
      return;
    }
    if (!bodyCode || !ctx.bodyCodes.includes(bodyCode)) {
      out.errors.push(`${label}: the body "${bodyCode}" is not configured. Add the body under Tender documents first.`);
      return;
    }
    const kind = (REGISTRATION_VALUE_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as RegistrationValueKind) : null;
    const key = `${bodyCode}|${kind}|${code}`;
    if (seen.has(key)) {
      out.errors.push(`${label}: the same code appears twice in the file.`);
      return;
    }
    seen.add(key);
    if (ctx.existing.some((e) => e.bodyCode === bodyCode && e.kind === kind && e.code === code)) {
      out.skipped += 1;
      return;
    }
    const rank = typeof r.rank === "number" ? r.rank : null;
    const provenance = provenanceOf(r.provenance);
    const valueCeiling = optional(r.valueCeiling) ?? (typeof r.valueCeiling === "number" ? String(r.valueCeiling) : null);
    const faults = valueFaults(
      { kind, code, nameEn, parentCode: optional(r.parentCode), rank, valueCeiling, ceilingProvenance: provenanceOf(r.ceilingProvenance), provenance },
      { bodyExists: true, codeTaken: false, categoryCodes: categories.get(bodyCode) ?? [], gradeRanks: ranks.get(bodyCode) ?? [] },
    );
    if (faults.length) {
      out.errors.push(`${label}: ${faults.map((f) => f.code).join(", ")}.`);
      return;
    }
    if (rank != null) ranks.set(bodyCode, [...(ranks.get(bodyCode) ?? []), rank]);
    out.rows.push({ bodyCode, kind: kind!, code, nameEn, nameMs: optional(r.nameMs), parentCode: optional(r.parentCode), rank, valueCeiling, ceilingProvenance: provenanceOf(r.ceilingProvenance), governingSource: text(r.governingSource), provenance: provenance! });
  });
  return out;
}

/// The lists file: banks and account types, each a code and a name.
export function judgeListFile(raw: unknown, ctx: { existing: readonly { list: string; code: string }[] }): Judged<SeedListEntry> {
  const out: Judged<SeedListEntry> = { rows: [], skipped: 0, errors: [] };
  if (!Array.isArray(raw)) return { ...out, errors: ["The file must be a list of rows."] };
  const seen = new Set<string>();
  raw.forEach((r, i) => {
    const at = `Row ${i + 1}`;
    if (!isRecord(r)) {
      out.errors.push(`${at}: not a row.`);
      return;
    }
    const nameEn = text(r.nameEn);
    const code = text(r.code);
    const label = `${at}${code ? ` (${code})` : ""}`;
    if (!nameEn) {
      out.errors.push(`${label}: it has no name. An entry with no name is never loaded.`);
      return;
    }
    const list = r.list === "BANK" || r.list === "ACCOUNT_TYPE" ? r.list : null;
    if (!list) {
      out.errors.push(`${label}: the list must be BANK or ACCOUNT_TYPE.`);
      return;
    }
    const key = `${list}|${code}`;
    if (seen.has(key)) {
      out.errors.push(`${label}: the same code appears twice in the file.`);
      return;
    }
    seen.add(key);
    if (ctx.existing.some((e) => e.list === list && e.code === code)) {
      out.skipped += 1;
      return;
    }
    const provenance = provenanceOf(r.provenance);
    const faults = listValueFaults({ code, nameEn, provenance }, { codeTaken: false, kindListed: true, list });
    if (faults.length) {
      out.errors.push(`${label}: ${faults.map((f) => f.code).join(", ")}.`);
      return;
    }
    out.rows.push({ list, code, nameEn, nameMs: optional(r.nameMs), governingSource: text(r.governingSource), provenance: provenance! });
  });
  return out;
}
