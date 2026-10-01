/**
 * Mandatory clauses (FR-DOC-011; SK004 §7.3.4): a clause every agreement must carry — the
 * anti-corruption clause is the spec's — kept as configuration (`ClauseText`), cited in a
 * template as {{clause:code}} and frozen with its text version. No clause ships, and none is
 * named here. An agreement whose template does not cite a mandatory clause blocks, unless a
 * legal-endorsement override names a Person and the reason (recorded on their behalf, not
 * signed). An agreement uploaded as a file cannot be read, so it needs the override too: it
 * is never taken as carrying the clause. A clause whose "mandatory" is not set blocks,
 * naming it: unset is not "optional". Pure.
 */

import { fieldsNamed } from "@/lib/templates/merge";

import { clauseCodeOf, clauseField } from "./fields";
import type { DocumentLanguage, ExerciseStatus, Finding, PackPartFacts, TenderPackStatus } from "./types";

export interface ClauseFacts {
  code: string;
  titleEn: string;
  titleMs: string | null;
  bodyEn: string;
  bodyMs: string | null;
  bodyVersion: number;
  mandatoryInAgreements: boolean | null;
  /// The organisation's day it was retired on, or null.
  retiredOn: string | null;
}

export interface OverrideFacts {
  clauseCode: string;
  clauseTitle: string;
  personName: string;
  reason: string;
}

export const liveClauses = (clauses: readonly ClauseFacts[], today: string) => clauses.filter((c) => c.retiredOn == null || c.retiredOn > today);

export type ClauseFault = "CLAUSE_MANDATORY_UNSET" | "AGREEMENT_PART_MISSING" | "CLAUSE_MISSING" | "CLAUSE_NOT_CHECKABLE" | "CLAUSE_LANGUAGE_MISSING" | "CLAUSE_OVERRIDDEN";

/// The agreements a pack issues: its conditions of contract parts, not omitted.
const agreementsOf = (parts: readonly PackPartFacts[]) => parts.filter((p) => p.role === "CONDITIONS" && p.state !== "OMITTED");

const textsOf = (p: PackPartFacts): { lang: DocumentLanguage; body: string }[] =>
  [
    { lang: "EN" as const, body: p.template?.bodyEn ?? "" },
    { lang: "MS" as const, body: p.template?.bodyMs ?? "" },
  ].filter((t) => t.body.trim());

/**
 * The clauses a pack is judged by: each live clause's "mandatory" set; each mandatory clause
 * cited by every agreement in every language it has text in, or overridden for this pack;
 * and every clause a template cites has text in the language it is cited in.
 */
export function clauseFaults(parts: readonly PackPartFacts[], clauses: readonly ClauseFacts[], overrides: readonly OverrideFacts[], today: string): Finding<ClauseFault>[] {
  const live = liveClauses(clauses, today);
  const out: Finding<ClauseFault>[] = [];
  for (const c of live) if (c.mandatoryInAgreements == null) out.push({ code: "CLAUSE_MANDATORY_UNSET", level: "block", data: { clause: c.titleEn } });
  const mandatory = live.filter((c) => c.mandatoryInAgreements === true);
  const agreements = agreementsOf(parts);
  if (mandatory.length && agreements.length === 0) out.push({ code: "AGREEMENT_PART_MISSING", level: "block" });
  for (const c of mandatory) {
    const ov = overrides.find((o) => o.clauseCode === c.code);
    if (ov) {
      out.push({ code: "CLAUSE_OVERRIDDEN", level: "info", data: { clause: c.titleEn, person: ov.personName, reason: ov.reason } });
      continue;
    }
    for (const p of agreements) {
      const part = `${p.printedNumber}. ${p.label}`;
      if (p.source !== "TEMPLATE") out.push({ code: "CLAUSE_NOT_CHECKABLE", level: "block", data: { part, clause: c.titleEn } });
      else if (p.template && textsOf(p).some((t) => !fieldsNamed(t.body).includes(clauseField(c.code)))) out.push({ code: "CLAUSE_MISSING", level: "block", data: { part, clause: c.titleEn, template: p.template.nameEn } });
    }
  }
  // A cited clause must have words in the language it is cited in (a Malay text with no Malay clause would print a gap).
  for (const p of parts) {
    if (p.state === "OMITTED" || p.source !== "TEMPLATE" || !p.template) continue;
    for (const t of textsOf(p)) {
      for (const k of fieldsNamed(t.body)) {
        const c = live.find((x) => x.code === clauseCodeOf(k));
        if (c && t.lang === "MS" && !c.bodyMs?.trim()) out.push({ code: "CLAUSE_LANGUAGE_MISSING", level: "block", data: { part: `${p.printedNumber}. ${p.label}`, clause: c.titleEn, language: "Malay" } });
      }
    }
  }
  return out;
}

/// The clauses' text in one language, as merge values: {{clause:code}} → its words.
export function clauseFieldValues(clauses: readonly ClauseFacts[], lang: DocumentLanguage): Record<string, string> {
  return Object.fromEntries(clauses.map((c) => [clauseField(c.code), (lang === "MS" ? c.bodyMs : c.bodyEn) ?? ""]));
}

/// The clauses a template part cites, with the text version each is frozen at (for the manifest).
export function clausesCited(p: PackPartFacts, clauses: readonly ClauseFacts[]): { code: string; title: string; bodyVersion: number }[] {
  const named = new Set(textsOf(p).flatMap((t) => fieldsNamed(t.body)).map(clauseCodeOf).filter((c): c is string => c != null));
  return clauses.filter((c) => named.has(c.code)).map((c) => ({ code: c.code, title: c.titleEn, bodyVersion: c.bodyVersion }));
}

export type OverrideFault = "PACK_NOT_EDITABLE" | "CLAUSE_NOT_MANDATORY" | "ALREADY_OVERRIDDEN" | "PERSON_REQUIRED" | "PERSON_NOT_ACTIVE" | "REASON_REQUIRED";

/// Recording a legal-endorsement override: on a draft, for a live mandatory clause not already overridden, by an active Person, with the reason.
export function overrideFaults(i: {
  packStatus: TenderPackStatus;
  exerciseStatus: ExerciseStatus;
  clause: ClauseFacts | null;
  today: string;
  existing: readonly { clauseCode: string }[];
  person: { isActive: boolean } | null;
  reason: string;
}): Finding<OverrideFault>[] {
  if (i.packStatus !== "DRAFT" || i.exerciseStatus !== "DOCUMENTS_IN_PREPARATION") return [{ code: "PACK_NOT_EDITABLE", level: "block" }];
  const out: Finding<OverrideFault>[] = [];
  if (!i.clause || i.clause.mandatoryInAgreements !== true || !liveClauses([i.clause], i.today).length) out.push({ code: "CLAUSE_NOT_MANDATORY", level: "block" });
  else if (i.existing.some((o) => o.clauseCode === i.clause!.code)) out.push({ code: "ALREADY_OVERRIDDEN", level: "block" });
  if (!i.person) out.push({ code: "PERSON_REQUIRED", level: "block" });
  else if (!i.person.isActive) out.push({ code: "PERSON_NOT_ACTIVE", level: "block" });
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}

export type ClauseConfigFault = "CODE_REQUIRED" | "CODE_TAKEN" | "TITLE_REQUIRED" | "BODY_REQUIRED" | "BODY_HAS_FIELD" | "PROVENANCE_REQUIRED";

/// A clause as saved: a code of its own, a title and English text, literal words (a clause names no merge field), and where it comes from.
export function clauseConfigFaults(c: { id?: string; code: string; titleEn: string; bodyEn: string; bodyMs: string | null; provenance: string | null }, others: readonly { id: string; code: string }[]): Finding<ClauseConfigFault>[] {
  const out: Finding<ClauseConfigFault>[] = [];
  const f = (code: ClauseConfigFault, field: string) => out.push({ code, level: "block", data: { field } });
  if (!/^[a-z0-9_]+$/.test(c.code)) f("CODE_REQUIRED", "code");
  else if (others.some((o) => o.id !== c.id && o.code === c.code)) f("CODE_TAKEN", "code");
  if (!c.titleEn.trim()) f("TITLE_REQUIRED", "titleEn");
  if (!c.bodyEn.trim()) f("BODY_REQUIRED", "bodyEn");
  if (fieldsNamed(c.bodyEn).length) f("BODY_HAS_FIELD", "bodyEn");
  if (fieldsNamed(c.bodyMs).length) f("BODY_HAS_FIELD", "bodyMs");
  if (!c.provenance) f("PROVENANCE_REQUIRED", "provenance");
  return out;
}

/// A clause's text version after a save: one more where its words changed, as a template's does.
export const nextBodyVersion = (before: { bodyEn: string; bodyMs: string | null; bodyVersion: number } | null, after: { bodyEn: string; bodyMs: string | null }) =>
  before == null ? 1 : before.bodyEn === after.bodyEn && (before.bodyMs ?? null) === (after.bodyMs ?? null) ? before.bodyVersion : before.bodyVersion + 1;
