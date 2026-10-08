/**
 * What a registration requirement asks of a bidder's registration, as structured needs (Phase 4c, 615-C1; ruled 2026-10-02, BD-615-1/7): references to the registration body's configured
 * values, so eligibility can COMPARE them (`src/lib/suppliers/eligibility.ts`) instead of printing words.
 *
 * - One minimum grade, compared by the grade's configured rank (read live when judged; the snapshot is for display only).
 * - Categories and specialisations: holding any one is enough.
 * - Field codes and permit types: every one is needed. (Permit types are not ruled either way; "every one" is the default taken, and logged for the product owner.)
 * - A class is not a need in this version.
 *
 * Free text is never parsed: words an officer types stay words ("stated in words only, not compared"). When the officer chooses needs and leaves the words empty, the words are COMPOSED
 * from the needs, so the notice prints what is compared, and the requirement records that the words are composed (`qualifiersFromNeeds`) so eligibility does not read them as a second
 * condition it cannot compare. Codes never stand alone: a need reads "code — name". Pure.
 */

import type { Finding } from "./types";

export const NEED_KINDS = ["GRADE", "CATEGORY", "SPECIALISATION", "FIELD_CODE", "PERMIT_TYPE"] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

/// The form's field for each kind (the names the drawer posts under).
export const NEED_FIELD: Readonly<Record<NeedKind, string>> = { GRADE: "needGrade", CATEGORY: "needCategories", SPECIALISATION: "needSpecialisations", FIELD_CODE: "needFieldCodes", PERMIT_TYPE: "needPermits" };

export type NeedFault = "NEED_VALUE_UNKNOWN" | "NEED_NOT_OF_BODY" | "NEED_KIND_NOT_TAKEN" | "NEED_RETIRED" | "NEED_TWICE" | "ONE_GRADE_ONLY" | "NEEDS_NOT_TAKEN";

/// A configured value of a body as the rules read it.
export interface NeedValue {
  id: string;
  bodyCode: string;
  kind: string;
  code: string;
  nameEn: string;
  /// The organisation's day it was retired on, or null.
  retiredOn: string | null;
}

export interface NeedChoice {
  kind: NeedKind;
  valueId: string;
}

/// The form field a fault belongs to, so the drawer shows it beside the list it concerns.
export const needFaultField = (f: Finding<NeedFault>): string => (f.code === "NEEDS_NOT_TAKEN" ? "bodyCode" : f.code === "ONE_GRADE_ONLY" ? NEED_FIELD.GRADE : (NEED_FIELD[f.data?.kind as NeedKind] ?? "bodyCode"));

/// "code — name": a code never stands alone.
export const needLabel = (v: Pick<NeedValue, "code" | "nameEn">) => `${v.code} — ${v.nameEn}`;

/**
 * The needs as chosen, against the body's configured values and the day. Each must be a live value of the requirement's own body and of the kind it was chosen as; none is required
 * (words alone are still allowed); at most one grade; none twice; and a body that takes nothing stated with it takes no needs.
 */
export function needFaults(choices: readonly NeedChoice[], values: readonly NeedValue[], body: { code: string; qualifierLabelEn: string | null }, today: string): Finding<NeedFault>[] {
  const out: Finding<NeedFault>[] = [];
  if (choices.length > 0 && !body.qualifierLabelEn) out.push({ code: "NEEDS_NOT_TAKEN", level: "block" });
  const seen = new Set<string>();
  for (const c of choices) {
    const v = values.find((x) => x.id === c.valueId);
    if (!v) {
      out.push({ code: "NEED_VALUE_UNKNOWN", level: "block", data: { kind: c.kind } });
      continue;
    }
    if (v.bodyCode !== body.code) out.push({ code: "NEED_NOT_OF_BODY", level: "block", data: { value: needLabel(v), kind: c.kind } });
    else if (v.kind !== c.kind) out.push({ code: "NEED_KIND_NOT_TAKEN", level: "block", data: { value: needLabel(v), kind: c.kind } });
    else if (v.retiredOn != null && v.retiredOn <= today) out.push({ code: "NEED_RETIRED", level: "block", data: { value: needLabel(v), kind: c.kind } });
    if (seen.has(c.valueId)) out.push({ code: "NEED_TWICE", level: "block", data: { value: needLabel(v), kind: c.kind } });
    seen.add(c.valueId);
  }
  if (choices.filter((c) => c.kind === "GRADE").length > 1) out.push({ code: "ONE_GRADE_ONLY", level: "block" });
  return [...new Map(out.map((f) => [`${f.code}|${JSON.stringify(f.data ?? {})}`, f])).values()];
}

/**
 * The words a notice prints for the needs, in English: "minimum grade G5 — Grade five; category B — Buildings or CE — Civil; field codes 12 — Water, 13 — Pumps". The order is fixed
 * (grade, categories, specialisations, field codes, permit types) so the same needs always read the same.
 */
export function composeQualifiers(needs: readonly { kind: NeedKind; label: string }[]): string {
  const of = (k: NeedKind) => needs.filter((n) => n.kind === k).map((n) => n.label);
  const parts: string[] = [];
  const grade = of("GRADE")[0];
  if (grade) parts.push(`minimum grade ${grade}`);
  const cats = of("CATEGORY");
  if (cats.length) parts.push(`${cats.length > 1 ? "category, any of" : "category"} ${cats.join(" or ")}`);
  const specs = of("SPECIALISATION");
  if (specs.length) parts.push(`${specs.length > 1 ? "specialisation, any of" : "specialisation"} ${specs.join(" or ")}`);
  const fields = of("FIELD_CODE");
  if (fields.length) parts.push(`${fields.length > 1 ? "field codes, every one of" : "field code"} ${fields.join(", ")}`);
  const permits = of("PERMIT_TYPE");
  if (permits.length) parts.push(`${permits.length > 1 ? "permit types, every one of" : "permit type"} ${permits.join(", ")}`);
  return parts.join("; ");
}

const KIND_WORDS: Readonly<Record<NeedKind, string>> = { GRADE: "grade", CATEGORY: "category", SPECIALISATION: "specialisation", FIELD_CODE: "field code", PERMIT_TYPE: "permit type" };

export const NEED_FAULT_TEXT: Readonly<Record<NeedFault, (d: Record<string, string | number | null>) => string>> = {
  NEED_VALUE_UNKNOWN: () => "One of the codes chosen is not on the registration body's list any more. Choose again.",
  NEED_NOT_OF_BODY: (d) => `${d.value} belongs to another registration body. Choose from this body's list.`,
  NEED_KIND_NOT_TAKEN: (d) => `${d.value} is not a ${KIND_WORDS[d.kind as NeedKind] ?? "code of that kind"}. Choose from the matching list.`,
  NEED_RETIRED: (d) => `${d.value} is retired. Choose a code that is still in use.`,
  NEED_TWICE: (d) => `${d.value} is chosen twice.`,
  ONE_GRADE_ONLY: () => "Choose one grade: the lowest a bidder may hold.",
  NEEDS_NOT_TAKEN: () => "This registration body takes nothing stated with it, so no grade or code can be asked for. Clear them, or choose another body.",
};
