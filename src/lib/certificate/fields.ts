/**
 * A certificate's merge fields (FR-CRT-002, ADR 0008). Every one is bound: it resolves from the certificate's
 * frozen figures, the pinned baseline version or the contract, and no form posts it (a source scan holds the
 * actions to that). A template names only these; an unknown one is refused when the template is saved, and
 * again when the certificate is issued. Pure.
 *
 * Figures are named `figure.<key>`. Which keys a kind's figures carry is the owning 6.13 module's: it lists
 * them in `KIND_FIGURE_KEYS` when it builds the kind. Increment 1 ships none, so no form may name a figure yet.
 */

import { formatDay, formatPeriod } from "@/lib/award/fields";
import { formatSen, parseSen } from "@/lib/money";

import { KIND_WORDS } from "./labels";
import type { EffectiveLine, EffectiveTotal } from "./override";
import type { CertificateKind } from "./types";

export type Lang = "EN" | "MS";

export const CERTIFICATE_MERGE_FIELDS: readonly { key: string; labelEn: string; labelMs: string }[] = [
  { key: "organisation.name", labelEn: "Organisation", labelMs: "Organisasi" },
  { key: "contract.number", labelEn: "Contract number", labelMs: "Nombor kontrak" },
  { key: "contract.title", labelEn: "Contract title", labelMs: "Tajuk kontrak" },
  { key: "contract.sum", labelEn: "Contract sum (pinned baseline)", labelMs: "Harga kontrak (garis dasar)" },
  { key: "contract.date", labelEn: "Contract Date (pinned baseline)", labelMs: "Tarikh Kontrak (garis dasar)" },
  { key: "contract.completionPeriod", labelEn: "Completion period (pinned baseline)", labelMs: "Tempoh siap (garis dasar)" },
  { key: "contractor.name", labelEn: "Contractor", labelMs: "Kontraktor" },
  { key: "certificate.kind", labelEn: "Certificate", labelMs: "Perakuan" },
  { key: "certificate.number", labelEn: "Certificate number", labelMs: "Nombor perakuan" },
  { key: "certificate.sequence", labelEn: "Certificate's number of its kind on the contract", labelMs: "Bilangan perakuan jenisnya" },
  { key: "certificate.date", labelEn: "Certificate date", labelMs: "Tarikh perakuan" },
];

/// The figure keys each kind's form may name. The owning 6.13 module fills its kind's list; none in increment 1.
export const KIND_FIGURE_KEYS: Readonly<Record<CertificateKind, readonly string[]>> = {
  DELEGATION_LETTER: [],
  DELEGATION_NOTICE: [],
  INTERIM_PAYMENT: [],
  ADVANCE_PAYMENT: [],
  LAD_WARNING: [],
  NON_COMPLETION: [],
  VARIATION_APPLICATION: [],
  SO_INSTRUCTION: [],
  VARIATION: [],
  SUM_ADJUSTMENT: [],
  // 6.13 Part B run 1a: empty (BD-614-24); each kind's assembler declares the values it fills in its own module.
  EOT: [],
  CONTRACT_PERIOD_AGREEMENT: [],
  PARTIAL_OCCUPATION: [],
  PRACTICAL_COMPLETION: [],
  SCHEDULE_OF_DEFECTS: [],
  MAKING_GOOD_DEFECTS: [],
  TERMINATION_INTENT: [],
  TERMINATION: [],
  TERMINATED_FINAL: [],
  NOMINATION_LETTER: [],
  FINAL: [],
};

export const FIGURE_PREFIX = "figure.";
export const figureField = (key: string) => `${FIGURE_PREFIX}${key}`;

/// Every key a form of this kind may name.
export function mergeFields(kind: CertificateKind): ReadonlySet<string> {
  return new Set([...CERTIFICATE_MERGE_FIELDS.map((f) => f.key), ...KIND_FIGURE_KEYS[kind].map(figureField)]);
}

/// Every key any certificate form may name (for the template register's save, which knows no kind).
export const ANY_CERTIFICATE_FIELD: ReadonlySet<string> = new Set([...CERTIFICATE_MERGE_FIELDS.map((f) => f.key), ...Object.values(KIND_FIGURE_KEYS).flat().map(figureField)]);

export function certificateFieldLabel(key: string): string {
  const f = CERTIFICATE_MERGE_FIELDS.find((x) => x.key === key);
  if (f) return f.labelEn;
  return key.startsWith(FIGURE_PREFIX) ? "A figure" : "A field";
}

/**
 * What a field needs to have a value when the certificate is issued (6.14 inc 1 fix M-2), so the first
 * signature can refuse a form that could never issue rather than pin it:
 * - DATING_BLOCK: the certificate's date is the dating block's act, so the form needs a block that dates it;
 * - BASELINE: the pinned baseline version must hold the value (the Contract Date is null before execution);
 * - FIGURE: the certificate's frozen figures must carry the figure with a value (6.13 fills
 *   KIND_FIGURE_KEYS; the rule is in place for the day it does);
 * - ALWAYS: the contract, the organisation, the kind, and the number and sequence the issue allocates.
 */
export type FieldNeed = { need: "ALWAYS" } | { need: "DATING_BLOCK" } | { need: "BASELINE"; key: "contractDate" } | { need: "FIGURE"; key: string };

export function fieldNeed(field: string): FieldNeed {
  if (field === "certificate.date") return { need: "DATING_BLOCK" };
  if (field === "contract.date") return { need: "BASELINE", key: "contractDate" };
  if (field.startsWith(FIGURE_PREFIX)) return { need: "FIGURE", key: field.slice(FIGURE_PREFIX.length) };
  return { need: "ALWAYS" };
}

/// Every bound field is one the certificate fills: no form carries an input for any of them.
export const BOUND_FIELDS: readonly string[] = CERTIFICATE_MERGE_FIELDS.map((f) => f.key);

export interface FieldContext {
  lang: Lang;
  organisationName: string;
  contract: { number: string; title: string; contractorName: string };
  /// The pinned baseline version's values (ADR 0021): never read live.
  baseline: { contractSum: string; contractDate: string | null; completionPeriod: number; completionUnit: "DAYS" | "WEEKS" | "MONTHS" };
  certificate: { kind: CertificateKind; number: string | null; sequence: number | null; date: string | null };
  figures: { lines: readonly EffectiveLine[]; totals: readonly EffectiveTotal[] };
}

const pct = (v: string) => `${v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;

/// A figure's value as printed in the form's language. Empty where not computed (refused at issue as missing).
function figureText(type: EffectiveLine["type"], value: string | null, lang: Lang): string {
  if (value == null) return "";
  switch (type) {
    case "MONEY":
      return formatSen(parseSen(value));
    case "PERCENT":
      return pct(value);
    case "DAYS":
      return lang === "MS" ? `${value} hari` : `${value} ${value === "1" ? "day" : "days"}`;
    case "DATE":
      return formatDay(value, lang);
    case "TEXT":
      return value;
  }
}

/// The value of every field, formatted once, in the form's language.
export function certificateFieldValues(c: FieldContext): Record<string, string> {
  const L = c.lang;
  const out: Record<string, string> = {
    "organisation.name": c.organisationName,
    "contract.number": c.contract.number,
    "contract.title": c.contract.title,
    "contract.sum": formatSen(parseSen(c.baseline.contractSum)),
    "contract.date": formatDay(c.baseline.contractDate, L),
    "contract.completionPeriod": formatPeriod(c.baseline.completionPeriod, c.baseline.completionUnit, L),
    "contractor.name": c.contract.contractorName,
    "certificate.kind": L === "MS" ? KIND_WORDS[c.certificate.kind].ms : KIND_WORDS[c.certificate.kind].en,
    "certificate.number": c.certificate.number ?? "",
    "certificate.sequence": c.certificate.sequence == null ? "" : String(c.certificate.sequence),
    "certificate.date": formatDay(c.certificate.date, L),
  };
  for (const l of c.figures.lines) out[figureField(l.key)] = figureText(l.type, l.value, L);
  for (const t of c.figures.totals) out[figureField(t.key)] = t.value == null ? "" : formatSen(parseSen(t.value));
  return out;
}
