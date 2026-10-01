/**
 * The merge fields a tender pack's template may name (ADR 0008 shape), and their values
 * for one pack. A whitelist, separate from the award's: a field not on it is reported and
 * never printed as written. Values are words (labels, references), never codes. Dates of
 * tendering are not merge fields in increment 1: they are recorded at approval, after the
 * parts freeze (the notice's validity window arrives with FR-DOC-005, increment 2).
 */

import type { MergeWhitelist } from "@/lib/templates/merge";

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
];

const KEYS: ReadonlySet<string> = new Set(PACK_MERGE_FIELDS.map((f) => f.key));

export const PACK_WHITELIST: MergeWhitelist = {
  has: (k) => KEYS.has(k),
  label: (k) => PACK_MERGE_FIELDS.find((f) => f.key === k)?.labelEn ?? "A field",
};

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
