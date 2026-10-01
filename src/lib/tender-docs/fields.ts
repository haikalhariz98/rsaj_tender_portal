/**
 * The merge fields a tender pack's template may name (ADR 0008 shape), and their values
 * for one pack. A whitelist, separate from the award's: a field not on it is reported and
 * never printed as written. Values are words (labels, references), never codes.
 *
 * Increment 2: the notice's eligibility (FR-DOC-005) — the registrations required and their
 * validity window, from the proposed start to the proposed closing day (the approving step
 * must then record those days: `frozenWindowFault`) — the regulator permit the instructions
 * name (FR-DOC-006), and the configured clauses, cited as {{clause:code}} (FR-DOC-011).
 */

import { fieldsNamed, type MergeWhitelist } from "@/lib/templates/merge";

export const PACK_MERGE_FIELDS: readonly { key: string; labelEn: string }[] = [
  { key: "organisation.name", labelEn: "Organisation" },
  { key: "exercise.reference", labelEn: "Exercise reference" },
  { key: "exercise.title", labelEn: "Exercise title" },
  { key: "requisition.reference", labelEn: "Requisition reference" },
  { key: "pack.kind", labelEn: "Document pack" },
  { key: "pack.version", labelEn: "Pack version" },
  { key: "pack.form", labelEn: "Standard form of contract" },
  { key: "contract.basis", labelEn: "Contract basis" },
  { key: "contract.type", labelEn: "Contract type" },
  { key: "eligibility.registration", labelEn: "Registration required" },
  { key: "eligibility.window", labelEn: "Validity window" },
  { key: "permit.type", labelEn: "Regulator permit" },
];

/// The notice's eligibility fields (FR-DOC-005) and the instructions' permit field (FR-DOC-006).
export const ELIGIBILITY_FIELDS = ["eligibility.registration", "eligibility.window"] as const;
export const WINDOW_FIELD = "eligibility.window";
export const PERMIT_FIELD = "permit.type";

/// A configured clause is cited as {{clause:code}} (FR-DOC-011).
export const CLAUSE_PREFIX = "clause:";
export const clauseField = (code: string) => `${CLAUSE_PREFIX}${code}`;
export const clauseCodeOf = (key: string) => (key.startsWith(CLAUSE_PREFIX) ? key.slice(CLAUSE_PREFIX.length) : null);

/// The templates whose text (in either language) cites a clause, by name: where a clause is carried from.
export function templatesCiting(clauseCode: string, templates: readonly { nameEn: string; bodyEn: string | null; bodyMs: string | null }[]): string[] {
  const key = clauseField(clauseCode);
  return templates.filter((t) => [t.bodyEn, t.bodyMs].some((b) => !!b && fieldsNamed(b).includes(key))).map((t) => t.nameEn);
}

const KEYS: ReadonlySet<string> = new Set(PACK_MERGE_FIELDS.map((f) => f.key));

/// The pack's fixed fields only: a clause citation is unknown to it (fails safe, never printed).
export const PACK_WHITELIST: MergeWhitelist = {
  has: (k) => KEYS.has(k),
  label: (k) => PACK_MERGE_FIELDS.find((f) => f.key === k)?.labelEn ?? "A field",
};

/// The pack's fields and the clauses live today, as a pack is judged and frozen with them.
export function packWhitelist(clauses: readonly { code: string; titleEn: string }[]): MergeWhitelist {
  const byCode = new Map(clauses.map((c) => [c.code, c.titleEn]));
  return {
    has: (k) => KEYS.has(k) || (clauseCodeOf(k) != null && byCode.has(clauseCodeOf(k)!)),
    label: (k) => (clauseCodeOf(k) != null ? `Clause ${byCode.get(clauseCodeOf(k)!) ?? ""}`.trim() : PACK_WHITELIST.label(k)),
  };
}

/**
 * What a template's save refuses (BD-64-2): a field neither an award (`awardHas`) nor a pack
 * fills, and a clause citation naming no configured clause. Each instrument re-checks its
 * own whitelist when it is issued or frozen.
 */
export function templateFieldRefusals(named: readonly string[], awardHas: (k: string) => boolean, clauseCodes: readonly string[]): string[] {
  return named.filter((k) => !awardHas(k) && !KEYS.has(k) && !(clauseCodeOf(k) != null && clauseCodes.includes(clauseCodeOf(k)!)));
}

export interface PackFieldContext {
  organisationName: string;
  exerciseReference: string;
  exerciseTitle: string;
  requisitionReference: string;
  packKindLabel: string;
  versionNo: number;
  formLabel: string | null;
  basisName: string | null;
  typeName: string | null;
}

/// Each field's value for one pack. A value not known is left empty, so the render reports it missing.
export function packFieldValues(c: PackFieldContext): Record<string, string> {
  return {
    "organisation.name": c.organisationName,
    "exercise.reference": c.exerciseReference,
    "exercise.title": c.exerciseTitle,
    "requisition.reference": c.requisitionReference,
    "pack.kind": c.packKindLabel,
    "pack.version": String(c.versionNo),
    "pack.form": c.formLabel ?? "",
    "contract.basis": c.basisName ?? "",
    "contract.type": c.typeName ?? "",
  };
}
