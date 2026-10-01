/**
 * The tender pack: its parts, when they are ready, when the pack may start, and what
 * submitting it requires (FR-DOC-001, 003, 007, 008; 6.2 OD-4, OD-8; ADR 0013).
 *
 * A pack is a version on the exercise. Its parts are resolved from configuration when it
 * starts and kept on it; each part is made ready from its source — a library template
 * drawn by body version, the bill issued unpriced, the Appendix entered here, or a file
 * uploaded to the part — or omitted with a reason where it is not mandatory. Submitting
 * freezes it: the parts' text is rendered and stored, the bill and the files are pinned,
 * and from then on nothing on it changes. A returned pack stays as it was; the next
 * version starts from it. Every finding names what to do and where (labels.ts). Pure.
 */

import { packFaults, type PackFault, type PackInput } from "@/lib/scope/pack";
import { renderWith, type MergeWhitelist } from "@/lib/templates/merge";

import { appendixFaults, type AppendixFacts, type AppendixFault } from "./appendix";
import { behaviourFaults, type BehaviourContext, type BehaviourFault } from "./behaviour";
import type { Composition, CompositionFault } from "./composition";
import { conditionsFaults, type ConditionsFault, type ConditionsInput } from "./conditions";
import { PACK_WHITELIST } from "./fields";
import type { DatesFault, TenderingRouteState } from "./tendering";
import type { BehaviourKey, BehaviourValue } from "@/lib/method/profile";
import type { ExerciseStatus, Finding, PackKind, PackPartFacts, TemplateFacts, TenderPackStatus } from "./types";

/// The packs that are live: a draft, or one with approval. At most one per exercise.
export const LIVE_PACK_STATUSES: readonly TenderPackStatus[] = ["DRAFT", "SUBMITTED"];
export const isLivePack = (s: TenderPackStatus) => LIVE_PACK_STATUSES.includes(s);

/// A part as it is named in a finding: its printed number and label.
export const partName = (p: Pick<PackPartFacts, "printedNumber" | "label">) => `${p.printedNumber}. ${p.label}`;

// ------------------------------------------------------------------ editing a pack

export type EditFault = "PACK_NOT_DRAFT" | "EXERCISE_NOT_IN_PREPARATION";

/// Whether the pack's parts and Appendix may change: a draft, on an exercise in preparation.
export function packEditFault(packStatus: TenderPackStatus, exerciseStatus: ExerciseStatus): Finding<EditFault> | null {
  if (exerciseStatus !== "DOCUMENTS_IN_PREPARATION") return { code: "EXERCISE_NOT_IN_PREPARATION", level: "block" };
  if (packStatus !== "DRAFT") return { code: "PACK_NOT_DRAFT", level: "block", data: { status: packStatus } };
  return null;
}

// ------------------------------------------------------------------ a part's content

export type ContentFault =
  | "TEMPLATE_NOT_SET"
  | "TEMPLATE_BODY_EMPTY"
  | "TEMPLATE_LANGUAGE_NOT_SET"
  | "TEMPLATE_UNKNOWN_FIELD"
  | "BESPOKE_FROM_LIBRARY"
  | "BQ_PART_WITHOUT_BQ"
  | "UPLOAD_MISSING"
  | "APPENDIX_INCOMPLETE";

export interface ContentContext {
  /// The exercise has a finalised bill to issue unpriced.
  bqFinalised: boolean;
  /// The Appendix is complete (no `appendixFaults`); null where the pack has none.
  appendixComplete: boolean | null;
  /// The merge fields a template may name: the pack's and the live clauses' (`packWhitelist`). Absent: the pack's only, so a clause citation is refused (fails safe).
  whitelist?: MergeWhitelist;
}

/// Whether a template has text to freeze, and in which language it is issued first.
export function templateFaults(t: TemplateFacts, whitelist: MergeWhitelist = PACK_WHITELIST): Finding<ContentFault>[] {
  const en = !!t.bodyEn?.trim();
  const ms = !!t.bodyMs?.trim();
  if (!en && !ms) return [{ code: "TEMPLATE_BODY_EMPTY", level: "block", data: { template: t.nameEn } }];
  const out: Finding<ContentFault>[] = [];
  if (en && ms && !t.primaryLanguage) out.push({ code: "TEMPLATE_LANGUAGE_NOT_SET", level: "block", data: { template: t.nameEn } });
  const unknown = [...new Set([...(en ? renderWith(t.bodyEn!, {}, whitelist).unknown : []), ...(ms ? renderWith(t.bodyMs!, {}, whitelist).unknown : [])])];
  if (unknown.length) out.push({ code: "TEMPLATE_UNKNOWN_FIELD", level: "block", data: { template: t.nameEn, fields: unknown.map((u) => `{{${u}}}`).join(", ") } });
  return out;
}

/**
 * What a part's content needs before it is ready, from its source (FR-DOC-003): a STANDARD
 * or MIXED part's template with text; a BESPOKE part never from the library; the bill
 * finalised; the Appendix complete; an uploaded part's file attached.
 */
export function partContentFaults(p: PackPartFacts, ctx: ContentContext): Finding<ContentFault>[] {
  const part = partName(p);
  switch (p.source) {
    case "TEMPLATE": {
      if (p.content === "BESPOKE") return [{ code: "BESPOKE_FROM_LIBRARY", level: "block", data: { part } }];
      if (!p.template) return [{ code: "TEMPLATE_NOT_SET", level: "block", data: { part } }];
      return templateFaults(p.template, ctx.whitelist).map((f) => ({ ...f, data: { ...f.data, part } }));
    }
    case "BQ_UNPRICED":
      return ctx.bqFinalised ? [] : [{ code: "BQ_PART_WITHOUT_BQ", level: "block", data: { part } }];
    case "APPENDIX":
      return ctx.appendixComplete === true ? [] : [{ code: "APPENDIX_INCOMPLETE", level: "block", data: { part } }];
    case "UPLOAD":
      return p.liveUploads > 0 ? [] : [{ code: "UPLOAD_MISSING", level: "block", data: { part } }];
  }
}

export type PartActFault = EditFault | ContentFault | "ALREADY_READY" | "ALREADY_OMITTED" | "MANDATORY_OMITTED" | "MANDATORY_UNSET" | "OMIT_REASON_REQUIRED" | "NOT_A_TEMPLATE_PART";

/// Marking a part ready: its content as its source needs it.
export function markReadyFaults(p: PackPartFacts, packStatus: TenderPackStatus, exerciseStatus: ExerciseStatus, ctx: ContentContext): Finding<PartActFault>[] {
  const edit = packEditFault(packStatus, exerciseStatus);
  if (edit) return [edit];
  if (p.state === "READY") return [{ code: "ALREADY_READY", level: "block" }];
  return partContentFaults(p, ctx);
}

/// Omitting a part: only one configured as not mandatory, and with the reason.
export function omitFaults(p: PackPartFacts, packStatus: TenderPackStatus, exerciseStatus: ExerciseStatus, reason: string): Finding<PartActFault>[] {
  const edit = packEditFault(packStatus, exerciseStatus);
  if (edit) return [edit];
  if (p.state === "OMITTED") return [{ code: "ALREADY_OMITTED", level: "block" }];
  const out: Finding<PartActFault>[] = [];
  if (p.mandatory === true) out.push({ code: "MANDATORY_OMITTED", level: "block", data: { part: partName(p) } });
  else if (p.mandatory == null) out.push({ code: "MANDATORY_UNSET", level: "block", data: { part: partName(p) } });
  if (!reason.trim()) out.push({ code: "OMIT_REASON_REQUIRED", level: "block", data: { part: partName(p) } });
  return out;
}

/// Choosing the library template a part draws (FR-DOC-003): a template part, not bespoke, with text.
export function pickTemplateFaults(p: PackPartFacts, t: TemplateFacts, packStatus: TenderPackStatus, exerciseStatus: ExerciseStatus, whitelist: MergeWhitelist = PACK_WHITELIST): Finding<PartActFault>[] {
  const edit = packEditFault(packStatus, exerciseStatus);
  if (edit) return [edit];
  if (p.source !== "TEMPLATE") return [{ code: "NOT_A_TEMPLATE_PART", level: "block", data: { part: partName(p) } }];
  if (p.content === "BESPOKE") return [{ code: "BESPOKE_FROM_LIBRARY", level: "block", data: { part: partName(p) } }];
  return templateFaults(t, whitelist).map((f) => ({ ...f, data: { ...f.data, part: partName(p) } }));
}

// ------------------------------------------------------------------ the pack's readiness

export type ReadinessFault = ContentFault | "MANDATORY_UNSET" | "PART_NOT_READY" | "MANDATORY_OMITTED" | "OMIT_REASON_REQUIRED" | "DECLARATION_PART_MISSING" | "DECLARATION_NOT_MANDATORY" | "NO_PARTS";

/**
 * Everything the parts still need (FR-DOC-001): each part ready or, where not mandatory,
 * omitted with a reason; each ready part's content still as its source needs it. Every
 * pack binds the bidder's declaration, mandatory (FR-DOC-008); its absence, or its
 * mandatory flag unset, blocks naming the configuration.
 */
export function packReadiness(parts: readonly PackPartFacts[], ctx: ContentContext): Finding<ReadinessFault>[] {
  if (parts.length === 0) return [{ code: "NO_PARTS", level: "block" }];
  const out: Finding<ReadinessFault>[] = [];
  for (const p of parts) {
    const part = partName(p);
    if (p.mandatory == null) out.push({ code: "MANDATORY_UNSET", level: "block", data: { part } });
    if (p.state === "NOT_STARTED") out.push({ code: "PART_NOT_READY", level: "block", data: { part } });
    else if (p.state === "OMITTED") {
      if (p.mandatory === true) out.push({ code: "MANDATORY_OMITTED", level: "block", data: { part } });
      if (!p.omittedReason.trim()) out.push({ code: "OMIT_REASON_REQUIRED", level: "block", data: { part } });
    } else out.push(...partContentFaults(p, ctx));
  }
  const declaration = parts.find((p) => p.role === "DECLARATION");
  if (!declaration) out.push({ code: "DECLARATION_PART_MISSING", level: "block" });
  else if (declaration.mandatory !== true) out.push({ code: "DECLARATION_NOT_MANDATORY", level: "block", data: { part: partName(declaration) } });
  return out;
}

// ------------------------------------------------------------------ starting a pack

export type StartFault = CompositionFault | "EXERCISE_NOT_IN_PREPARATION" | "PREPARED_BEFORE_ASSEMBLY" | "NO_PACK_FOR_METHOD" | "LIVE_PACK_EXISTS" | "PACK_APPROVED";

/**
 * Whether a pack may start: on an exercise in preparation whose pack kind was recorded
 * (one prepared before document assembly keeps the Phase 1 path, X-9), that assembles a
 * pack, with no pack live or approved, and a composition configured. `composition` is
 * resolved for the exercise's pack kind and basis.
 */
export function startPackFaults(i: { exerciseStatus: ExerciseStatus; packKindSnapshot: PackKind | null; packs: readonly { status: TenderPackStatus }[]; composition: Composition }): Finding<StartFault>[] {
  if (i.exerciseStatus !== "DOCUMENTS_IN_PREPARATION") return [{ code: "EXERCISE_NOT_IN_PREPARATION", level: "block" }];
  if (i.packKindSnapshot == null) return [{ code: "PREPARED_BEFORE_ASSEMBLY", level: "block" }];
  if (i.packKindSnapshot === "NONE") return [{ code: "NO_PACK_FOR_METHOD", level: "block" }];
  if (i.packs.some((p) => p.status === "APPROVED")) return [{ code: "PACK_APPROVED", level: "block" }];
  if (i.packs.some((p) => isLivePack(p.status))) return [{ code: "LIVE_PACK_EXISTS", level: "block" }];
  if ("fault" in i.composition) return [{ code: i.composition.fault, level: "block", ...(i.composition.role ? { data: { role: i.composition.role } } : {}) }];
  return [];
}

/// The next version's number, and the returned pack it continues where the latest was returned.
export function nextPack<P extends { id: string; versionNo: number; status: TenderPackStatus }>(packs: readonly P[]): { versionNo: number; copyFrom: P | null } {
  const latest = [...packs].sort((a, b) => b.versionNo - a.versionNo)[0] ?? null;
  return { versionNo: (latest?.versionNo ?? 0) + 1, copyFrom: latest?.status === "RETURNED" ? latest : null };
}

// ------------------------------------------------------------------ submitting

export type RouteFault = "NO_ISSUE_IN_FORCE" | "ROUTE_NO_METHOD_KEY" | "ROUTE_NO_RULE" | "ROUTE_HAS_COMMITTEE_STEP" | "ROUTE_REFUSED" | "ROUTE_ERROR" | "ROUTE_OPEN";

export interface SubmitInput {
  packStatus: TenderPackStatus;
  exerciseStatus: ExerciseStatus;
  parts: readonly PackPartFacts[];
  content: ContentContext;
  /// 6.2 OD-4: the scope's readiness inputs, read on locked rows.
  scope: PackInput;
  /// The Appendix, where the composition has one (a part with role APPENDIX); else null.
  appendix: AppendixFacts | null;
  /// The behaviours the exercise was decided under (its classification snapshot); null: not recorded.
  profile: readonly { key: BehaviourKey; value: BehaviourValue }[] | null;
  primeCostSums: BehaviourContext["primeCostSums"];
  /// The proposed start and closing (`approvalDatesFault`'s findings).
  dates: readonly Finding<DatesFault>[];
  /// The route as it would open: its state, a refusal in words, and engine errors.
  route: { issue: boolean; state: TenderingRouteState | null; refusal: string | null; errors: readonly string[] };
  /// An Approval for Tendering route is already open on the exercise.
  routeOpen: boolean;
  /// Increment 2: eligibility, restriction, permit, clauses, assurance (`conditionsFaults`).
  conditions: ConditionsInput;
}

export interface SubmitFindings {
  edit: Finding<EditFault>[];
  readiness: Finding<ReadinessFault>[];
  scope: Finding<PackFault>[];
  appendix: Finding<AppendixFault | "APPENDIX_NOT_STARTED">[];
  behaviour: Finding<BehaviourFault>[];
  conditions: Finding<ConditionsFault>[];
  dates: Finding<DatesFault>[];
  route: Finding<RouteFault>[];
}

/**
 * Everything that stands between the pack and approval for tendering: the parts, 6.2's
 * scope readiness (enforced here, on locked rows: OD-4), the Appendix (FR-DOC-004), the
 * contract type's behaviours (FR-MTD-012), the tender's conditions (increment 2: FR-DOC-005,
 * 006, 009, 010, 011, 014), the proposed dates and the route. Grouped, so
 * each finding is worded by its own family; `blockingOf` flattens them.
 */
export function submitFaults(i: SubmitInput): SubmitFindings {
  const edit = packEditFault(i.packStatus, i.exerciseStatus);
  const hasAppendixPart = i.parts.some((p) => p.role === "APPENDIX");
  const route: Finding<RouteFault>[] = [];
  if (i.routeOpen) route.push({ code: "ROUTE_OPEN", level: "block" });
  if (!i.route.issue) route.push({ code: "NO_ISSUE_IN_FORCE", level: "block" });
  else if (i.route.state === "NO_METHOD_KEY") route.push({ code: "ROUTE_NO_METHOD_KEY", level: "block" });
  else if (i.route.state === "NO_RULE" || i.route.state == null) route.push({ code: "ROUTE_NO_RULE", level: "block" });
  else if (i.route.state === "HAS_COMMITTEE_STEP") route.push({ code: "ROUTE_HAS_COMMITTEE_STEP", level: "block" });
  else if (i.route.refusal) route.push({ code: "ROUTE_REFUSED", level: "block", data: { text: i.route.refusal } });
  // The engine's own errors, where a rule resolved (a route that resolved nothing has said so above).
  if (i.route.issue && i.route.state === "RESOLVED") for (const e of i.route.errors) route.push({ code: "ROUTE_ERROR", level: "block", data: { text: e } });
  return {
    edit: edit ? [edit] : [],
    readiness: packReadiness(i.parts, i.content),
    scope: packFaults(i.scope),
    appendix: hasAppendixPart ? (i.appendix ? appendixFaults(i.appendix) : [{ code: "APPENDIX_NOT_STARTED", level: "block" }]) : [],
    behaviour: behaviourFaults(i.profile, { appendix: hasAppendixPart ? i.appendix : null, primeCostSums: i.primeCostSums, parts: i.parts }),
    conditions: conditionsFaults(i.parts, i.conditions),
    dates: [...i.dates],
    route,
  };
}

/// Every finding of a submission, flattened.
export const allOf = (s: SubmitFindings): Finding[] => [...s.edit, ...s.readiness, ...s.scope, ...s.appendix, ...s.behaviour, ...s.conditions, ...s.dates, ...s.route];
/// The ones that refuse it.
export const blockingOf = (s: SubmitFindings): Finding[] => allOf(s).filter((f) => f.level === "block");
