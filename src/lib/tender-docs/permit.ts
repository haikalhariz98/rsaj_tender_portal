/**
 * The regulator-permit clause (FR-DOC-006; SK001 7.3.4(a)): where the works are the regulated
 * activity, the instructions to tenderers state that the successful bidder must obtain the
 * regulator's permit, naming its type. The types are the customer's configured list (the
 * taxonomy the policy names); which type a value band needs is the regulator's and is not
 * modelled (OQ-04), so the officer chooses it. Unanswered is not "no". Pure.
 */

import { fieldsNamed } from "@/lib/templates/merge";

import { bodiesOf } from "./eligibility";
import { PERMIT_FIELD } from "./fields";
import type { DocumentLanguage, Finding, PackPartFacts } from "./types";

/// The configured permit types: the taxonomy the policy names, with its values. Null: the policy names none, or a taxonomy no longer configured.
export interface PermitList {
  name: string;
  values: readonly { code: string; label: string; /// The type's name in Malay; empty where the list has none.
    labelMs?: string | null; retired: boolean }[];
}

export type PermitFault =
  | "REGULATED_NOT_ANSWERED"
  | "PERMIT_LIST_NOT_SET"
  | "PERMIT_NOT_CHOSEN"
  | "PERMIT_NOT_ON_LIST"
  | "INSTRUCTIONS_PART_MISSING"
  | "PERMIT_NOT_IN_INSTRUCTIONS"
  | "INSTRUCTIONS_NOT_CHECKED"
  | "PERMIT_NAME_MS_MISSING"
  | "PERMIT_FIELD_NOT_REGULATED";

/// The answer and the type as saved: a type only where the answer is yes, from the configured list.
export function permitSaveFaults(regulated: boolean | null, permitCode: string | null, list: PermitList | null): Finding<PermitFault>[] {
  if (regulated !== true) return [];
  if (!list) return [{ code: "PERMIT_LIST_NOT_SET", level: "block" }];
  if (permitCode && !list.values.some((v) => v.code === permitCode && !v.retired)) return [{ code: "PERMIT_NOT_ON_LIST", level: "block" }];
  return [];
}

/**
 * The permit's name in the documents, in the language they are issued in, or null where none is
 * to be named or the list has no name in that language (a Malay document never prints the
 * English name in its place: `permitFaults` blocks first).
 */
export function permitLabel(regulated: boolean | null, permitCode: string | null, list: PermitList | null, lang: DocumentLanguage = "EN"): string | null {
  if (regulated !== true || !permitCode) return null;
  const v = list?.values.find((x) => x.code === permitCode);
  if (!v) return null;
  return lang === "MS" ? v.labelMs?.trim() || null : v.label;
}

/**
 * What submission needs of the permit: the question answered; where yes, a type from the
 * configured list, and the instructions naming it ({{permit.type}} in each language their
 * template has text in; an uploaded set is unchecked, a warning). Where no, no part names the
 * permit field (it would print an empty permit): another template is chosen.
 */
export function permitFaults(i: { regulated: boolean | null; permitCode: string | null; list: PermitList | null; parts: readonly PackPartFacts[] }): Finding<PermitFault>[] {
  if (i.regulated == null) return [{ code: "REGULATED_NOT_ANSWERED", level: "block" }];
  const live = i.parts.filter((p) => p.state !== "OMITTED");
  const naming = live.filter((p) => p.source === "TEMPLATE" && bodiesOf(p).some((b) => fieldsNamed(b).includes(PERMIT_FIELD)));
  if (i.regulated === false) return naming.map((p) => ({ code: "PERMIT_FIELD_NOT_REGULATED" as const, level: "block" as const, data: { part: `${p.printedNumber}. ${p.label}`, template: p.template?.nameEn ?? "" } }));
  const out: Finding<PermitFault>[] = [];
  if (!i.list) out.push({ code: "PERMIT_LIST_NOT_SET", level: "block" });
  else if (!i.permitCode) out.push({ code: "PERMIT_NOT_CHOSEN", level: "block" });
  else if (!i.list.values.some((v) => v.code === i.permitCode && !v.retired)) out.push({ code: "PERMIT_NOT_ON_LIST", level: "block" });
  const instructions = live.filter((p) => p.role === "INSTRUCTIONS");
  // Founder, 2026-10-20: English only. A Malay instruction would need the type's Malay name; none is issued now, so PERMIT_NAME_MS_MISSING is no longer given.
  if (instructions.length === 0) out.push({ code: "INSTRUCTIONS_PART_MISSING", level: "block" });
  for (const p of instructions) {
    const part = `${p.printedNumber}. ${p.label}`;
    if (p.source !== "TEMPLATE") out.push({ code: "INSTRUCTIONS_NOT_CHECKED", level: "warn", data: { part } });
    else if (bodiesOf(p).some((b) => !fieldsNamed(b).includes(PERMIT_FIELD))) out.push({ code: "PERMIT_NOT_IN_INSTRUCTIONS", level: "block", data: { part, template: p.template?.nameEn ?? "" } });
  }
  return out;
}
