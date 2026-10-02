/**
 * The Kertas Cadangan (FR-CTE-013, carried in from 6.10 and 6.6): rendered from the issued report
 * through the configured template and frozen; then checked by the holder of the checking office and
 * recommended by the holder of the recommending office, each on a day they held it, two different
 * people, both recorded — on their behalf, not signed — before the appointment is tabled. The offices
 * are the organisation's (Configuration › Evaluation models › Policy), frozen on the paper when it is
 * rendered; unset blocks, naming the setting. Pure.
 */

import type { Finding } from "./types";

export type ProposalFault = "ALREADY_RENDERED" | "CHECKER_NOT_SET" | "RECOMMENDER_NOT_SET" | "TEMPLATE_NOT_SET" | "TEMPLATE_TEXT_NOT_SET" | "TEMPLATE_LANGUAGE_NOT_SET" | "TEMPLATE_INCOMPLETE" | "TEMPLATE_UNKNOWN_FIELD" | "PERSON_REQUIRED";

export function renderFaults(i: { rendered: boolean; checkerRoleCode: string | null; recommenderRoleCode: string | null; template: { state: "OK" | "NOT_SET" | "NO_TEXT" | "NO_LANGUAGE"; missing: readonly string[]; unknown: readonly string[] }; personActive: boolean }): Finding<ProposalFault>[] {
  if (i.rendered) return [{ code: "ALREADY_RENDERED", level: "block" }];
  const out: Finding<ProposalFault>[] = [];
  const f = (code: ProposalFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.checkerRoleCode) f("CHECKER_NOT_SET");
  if (!i.recommenderRoleCode) f("RECOMMENDER_NOT_SET");
  if (i.template.state === "NOT_SET") f("TEMPLATE_NOT_SET");
  else if (i.template.state === "NO_TEXT") f("TEMPLATE_TEXT_NOT_SET");
  else if (i.template.state === "NO_LANGUAGE") f("TEMPLATE_LANGUAGE_NOT_SET");
  else {
    if (i.template.unknown.length) f("TEMPLATE_UNKNOWN_FIELD", { fields: i.template.unknown.join(", ") });
    if (i.template.missing.length) f("TEMPLATE_INCOMPLETE", { fields: i.template.missing.join(", ") });
  }
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

export type SignerRole = "CHECKER" | "RECOMMENDER";
export type SignerFault = "NOT_RENDERED" | "ALREADY_RECORDED" | "SAME_PERSON" | "NOT_OFFICE_HOLDER" | "PERSON_REQUIRED" | "DAY_REQUIRED" | "DAY_IN_FUTURE" | "DAY_BEFORE_PAPER" | "TIME_ZONE_NOT_SET";

/// Recording the checking or recommending officer: the office's holder on the day, never the other one.
export function signerFaults(i: { rendered: boolean; already: boolean; personId: string | null; personActive: boolean; otherSignerId: string | null; holdsOffice: boolean; day: string | null; today: string | null; paperDay: string | null }): Finding<SignerFault>[] {
  if (!i.rendered) return [{ code: "NOT_RENDERED", level: "block" }];
  if (i.already) return [{ code: "ALREADY_RECORDED", level: "block" }];
  const out: Finding<SignerFault>[] = [];
  const f = (code: SignerFault) => out.push({ code, level: "block" });
  if (!i.today) f("TIME_ZONE_NOT_SET");
  if (!i.personId || !i.personActive) f("PERSON_REQUIRED");
  else {
    if (i.otherSignerId === i.personId) f("SAME_PERSON");
    if (!i.holdsOffice) f("NOT_OFFICE_HOLDER");
  }
  if (!i.day) f("DAY_REQUIRED");
  else {
    if (i.today && i.day > i.today) f("DAY_IN_FUTURE");
    if (i.paperDay && i.day < i.paperDay) f("DAY_BEFORE_PAPER");
  }
  return out;
}
