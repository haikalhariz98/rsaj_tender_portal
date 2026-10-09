/**
 * The eligibility block of the notice (FR-DOC-005; SK001 7.3.4(a)): which registrations a
 * bidder must hold, and the window over which each must be valid — "from the advertisement
 * date through to the closing date", stated as a date range, never as a point in time.
 *
 * Ruling (6.4 conditions): the registrations are drawn from the bodies the customer
 * configures (`RegistrationBody`), never from columns per regulator. An exercise lists its
 * requirements; requirements sharing an alternative group are alternatives (any one is
 * enough) and every group is required, so "registered with the companies registry, and with
 * the construction board at a grade or the supplier register under a field code" is two
 * groups. Unset is not "none": an exercise with no requirement cannot be submitted.
 *
 * The notice must carry the block: a template notice names both eligibility fields; an
 * uploaded notice cannot be read, so it is said to be unchecked. Pure.
 */

import { formatDay } from "@/lib/award/fields";
import { fieldsNamed } from "@/lib/templates/merge";

import { ELIGIBILITY_FIELDS } from "./fields";
import type { NeedFault } from "./requirement-needs";
import type { DocumentLanguage, ExerciseStatus, Finding, PackPartFacts } from "./types";

/// A configured registration body as the rules read it.
export interface RegistrationBodyFacts {
  code: string;
  labelEn: string;
  labelMs: string | null;
  /// What an exercise states with the body (a grade and category; field codes). Null: nothing.
  qualifierLabelEn: string | null;
  /// The organisation's day it was retired on, or null.
  retiredOn: string | null;
}

/// A requirement on the exercise, with the body's words as they stood when it was entered.
export interface RequirementFacts {
  bodyCode: string;
  bodyLabel: string;
  bodyLabelMs: string | null;
  qualifierLabel: string | null;
  qualifiers: string;
  alternativeGroup: number;
  sortOrder: number;
}

export type EligibilityFault =
  | "ELIGIBILITY_NOT_SET"
  | "BODY_NOT_CONFIGURED"
  | "BODY_RETIRED"
  | "QUALIFIERS_REQUIRED"
  | "QUALIFIERS_NOT_TAKEN"
  | "GROUP_NOT_VALID"
  | "BODY_TWICE_IN_GROUP"
  | NeedFault;

const live = (b: RegistrationBodyFacts, today: string) => b.retiredOn == null || b.retiredOn > today;

/// One requirement as saved or as judged at submission: a live configured body, its qualifiers where it takes them, a group from 1.
export function requirementFaults(r: Pick<RequirementFacts, "bodyCode" | "qualifiers" | "alternativeGroup"> & { hasNeeds?: boolean }, bodies: readonly RegistrationBodyFacts[], today: string): Finding<EligibilityFault>[] {
  const body = bodies.find((b) => b.code === r.bodyCode);
  if (!body) return [{ code: "BODY_NOT_CONFIGURED", level: "block" }];
  const out: Finding<EligibilityFault>[] = [];
  const data = { body: body.labelEn };
  if (!live(body, today)) out.push({ code: "BODY_RETIRED", level: "block", data });
  // Structured needs (615-C1) say what is required, and their words are composed, so a body that takes a qualifier is satisfied by them.
  if (body.qualifierLabelEn && !r.qualifiers.trim() && !r.hasNeeds) out.push({ code: "QUALIFIERS_REQUIRED", level: "block", data: { ...data, qualifier: body.qualifierLabelEn } });
  if (!body.qualifierLabelEn && r.qualifiers.trim()) out.push({ code: "QUALIFIERS_NOT_TAKEN", level: "block", data });
  if (!Number.isInteger(r.alternativeGroup) || r.alternativeGroup < 1) out.push({ code: "GROUP_NOT_VALID", level: "block" });
  return out;
}

/**
 * The exercise's eligibility as submission judges it: at least one requirement; each on a
 * body still configured and live, with its qualifiers; no body twice in one group.
 */
export function eligibilityFaults(reqs: readonly RequirementFacts[], bodies: readonly RegistrationBodyFacts[], today: string): Finding<EligibilityFault>[] {
  if (reqs.length === 0) return [{ code: "ELIGIBILITY_NOT_SET", level: "block" }];
  const out: Finding<EligibilityFault>[] = [];
  for (const r of reqs) {
    const fs = requirementFaults(r, bodies, today);
    // A body taken off the configuration since: named as the exercise recorded it.
    out.push(...fs.map((f) => (f.code === "BODY_NOT_CONFIGURED" ? { ...f, data: { body: r.bodyLabel } } : f)));
  }
  const seen = new Set<string>();
  for (const r of reqs) {
    const k = `${r.alternativeGroup}|${r.bodyCode}`;
    if (seen.has(k)) out.push({ code: "BODY_TWICE_IN_GROUP", level: "block", data: { body: r.bodyLabel } });
    seen.add(k);
  }
  return out;
}

/// Where the eligibility may change: before the pack goes for approval (a draft or an exercise in preparation).
export function eligibilityEditFault(exerciseStatus: ExerciseStatus): Finding<"CONDITIONS_FROZEN"> | null {
  return exerciseStatus === "DRAFT" || exerciseStatus === "DOCUMENTS_IN_PREPARATION" ? null : { code: "CONDITIONS_FROZEN", level: "block" };
}

/// The exercises whose bidders are still to be compared by a grade's rank: their requirements are frozen (the pack has gone for approval) and the envelopes are not all opened. A grade's rank
/// of the requirement's body does not change while one stands (615-C1: the rank is read live, so a change here would change who qualifies on a requirement that cannot be edited).
export const RANK_HELD_STATUSES = ["PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", "ADVERTISED", "INVITED", "OPENING_IN_PROGRESS"] as const satisfies readonly ExerciseStatus[];

const JOIN = { EN: { and: "; and ", or: " or " }, MS: { and: "; dan ", or: " atau " } } as const;

/// The groups in order, each's requirements in order.
export function groupsOf<R extends Pick<RequirementFacts, "alternativeGroup" | "sortOrder">>(reqs: readonly R[]): R[][] {
  const groups = [...new Set(reqs.map((r) => r.alternativeGroup))].sort((a, b) => a - b);
  return groups.map((g) => reqs.filter((r) => r.alternativeGroup === g).sort((a, b) => a.sortOrder - b.sortOrder));
}

/**
 * The registrations required, as the notice states them: each group's alternatives joined by
 * "or", the groups by "and". A body's Malay name is used in a Malay document where it has one.
 * The qualifiers are the officer's own words (grade, category, codes), printed as entered.
 */
export function registrationText(reqs: readonly RequirementFacts[], lang: DocumentLanguage): string {
  const one = (r: RequirementFacts) => {
    const name = lang === "MS" ? (r.bodyLabelMs ?? r.bodyLabel) : r.bodyLabel;
    return r.qualifiers.trim() ? `${name} (${r.qualifiers.trim()})` : name;
  };
  return groupsOf(reqs)
    .map((g) => g.map(one).join(JOIN[lang].or))
    .join(JOIN[lang].and);
}

/// "from 12 October 2026 to 29 October 2026" (or in Malay): the window each registration must be valid over.
export function validityWindowText(startOn: string, closingDay: string, lang: DocumentLanguage): string {
  return lang === "MS" ? `dari ${formatDay(startOn, "MS")} hingga ${formatDay(closingDay, "MS")}` : `from ${formatDay(startOn, "EN")} to ${formatDay(closingDay, "EN")}`;
}

/// The eligibility fields' values in one language. The window is left empty (reported missing) until the dates are proposed.
export function eligibilityFieldValues(reqs: readonly RequirementFacts[], window: { startOn: string; closingDay: string } | null, lang: DocumentLanguage): Record<string, string> {
  return {
    "eligibility.registration": reqs.length ? registrationText(reqs, lang) : "",
    "eligibility.window": window ? validityWindowText(window.startOn, window.closingDay, lang) : "",
  };
}

export type NoticeFault = "NOTICE_PART_MISSING" | "NOTICE_LACKS_ELIGIBILITY" | "NOTICE_NOT_CHECKED";

/// The bodies a template part issues (each language it has text in).
export const bodiesOf = (p: Pick<PackPartFacts, "template">) => [p.template?.bodyEn, p.template?.bodyMs].filter((b): b is string => !!b?.trim());

/**
 * The notice carries the eligibility block (FR-DOC-005: "cannot be published without the
 * eligibility block populated"): a notice part not omitted; a template notice naming both
 * fields in every language it has text in; an uploaded notice is not read, so it is said to
 * be unchecked (a warning, never a pass).
 */
export function noticeFaults(parts: readonly PackPartFacts[]): Finding<NoticeFault>[] {
  const notices = parts.filter((p) => p.role === "INVITATION" && p.state !== "OMITTED");
  if (notices.length === 0) return [{ code: "NOTICE_PART_MISSING", level: "block" }];
  const out: Finding<NoticeFault>[] = [];
  for (const p of notices) {
    const part = `${p.printedNumber}. ${p.label}`;
    if (p.source === "TEMPLATE") {
      const missing = new Set<string>();
      for (const b of bodiesOf(p)) for (const f of ELIGIBILITY_FIELDS) if (!fieldsNamed(b).includes(f)) missing.add(f);
      if (missing.size) out.push({ code: "NOTICE_LACKS_ELIGIBILITY", level: "block", data: { part, template: p.template?.nameEn ?? "", fields: [...missing].map((f) => `{{${f}}}`).join(", ") } });
    } else out.push({ code: "NOTICE_NOT_CHECKED", level: "warn", data: { part } });
  }
  return out;
}
