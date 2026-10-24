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
 *
 * SR-11 (ruling 14, ADR 0035, superseding ADR 0008 and 0013 only where a file is uploaded): a part is not marked ready, it IS ready when its content is in
 * order, derived here (`partIssue`). An uploaded part is ready on its first live file; a merged-text part when its merge has no missing field, or when a
 * file is uploaded to it, the file then being what is issued; the bill part, where the bill is not built on screen (SR-09), is an uploaded part. An optional
 * part with nothing to issue is recorded "Not issued" at submission; a mandatory one blocks.
 */

import { returnedByDefinition } from "@/lib/opening/checklist";
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

/// SR-11: the reason recorded on an optional part that had nothing to issue when the documents were submitted.
export const NOT_ISSUED_REASON = "Not issued";

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
  /// SR-09 (ruling 13): the exercise's pin. False: the bill is an uploaded file, so the bill part takes a file as an uploaded part does. Null: not set (the gate says so).
  billOnScreen: boolean | null;
  /// Review S5: whether the contract basis is let on a bill of quantities. True with the bill off screen: the bill part is mandatory, whatever its configured flag says, since no bill is
  /// no tender. Null/absent: not known or not set (the scope findings say so).
  basisRequiresBq?: boolean | null;
  /// The Appendix is complete (no `appendixFaults`); null where the pack has none.
  appendixComplete: boolean | null;
  /// The merge fields a template may name: the pack's and the live clauses' (`packWhitelist`). Absent: the pack's only, so a clause citation is refused (fails safe).
  whitelist?: MergeWhitelist;
}

/// Whether a template has English text to freeze.
export function templateFaults(t: TemplateFacts, whitelist: MergeWhitelist = PACK_WHITELIST): Finding<ContentFault>[] {
  // Founder, 2026-10-20: English only. The pack is issued from the English text; a template with only a Malay text has none, and no language is chosen.
  if (!t.bodyEn?.trim()) return [{ code: "TEMPLATE_BODY_EMPTY", level: "block", data: { template: t.nameEn } }];
  const out: Finding<ContentFault>[] = [];
  const unknown = [...new Set(renderWith(t.bodyEn, {}, whitelist).unknown)];
  if (unknown.length) out.push({ code: "TEMPLATE_UNKNOWN_FIELD", level: "block", data: { template: t.nameEn, fields: unknown.map((u) => `{{${u}}}`).join(", ") } });
  return out;
}

/// SR-09, SR-11: whether a part is issued as an uploaded file by its nature: an uploaded part, or the bill part where the bill is not built on screen.
export const takesFile = (p: Pick<PackPartFacts, "source">, ctx: Pick<ContentContext, "billOnScreen">): boolean => p.source === "UPLOAD" || (p.source === "BQ_UNPRICED" && ctx.billOnScreen === false);

/// SR-11: whether a file may be uploaded to the part at all. Not the Appendix, which stays a form (SR-12); not the on-screen bill.
export const mayHoldFile = (p: Pick<PackPartFacts, "source">, ctx: Pick<ContentContext, "billOnScreen">): boolean => takesFile(p, ctx) || p.source === "TEMPLATE";

/**
 * What a part's content needs before it is ready, from its source (FR-DOC-003): a STANDARD
 * or MIXED part's template with text, or (SR-11) a file uploaded in its place; a BESPOKE part never
 * from the library; the bill finalised, or (SR-09) its file; the Appendix complete; an uploaded part's file attached.
 */
export function partContentFaults(p: PackPartFacts, ctx: ContentContext): Finding<ContentFault>[] {
  const part = partName(p);
  switch (p.source) {
    case "TEMPLATE": {
      // ADR 0035: an uploaded file replaces the merged text as the issued part, so the merge is not judged.
      if (p.liveUploads > 0) return [];
      if (p.content === "BESPOKE") return [{ code: "BESPOKE_FROM_LIBRARY", level: "block", data: { part } }];
      if (!p.template) return [{ code: "TEMPLATE_NOT_SET", level: "block", data: { part } }];
      return templateFaults(p.template, ctx.whitelist).map((f) => ({ ...f, data: { ...f.data, part } }));
    }
    case "BQ_UNPRICED":
      if (ctx.billOnScreen === false) return p.liveUploads > 0 ? [] : [{ code: "UPLOAD_MISSING", level: "block", data: { part, bill: 1 } }];
      return ctx.bqFinalised ? [] : [{ code: "BQ_PART_WITHOUT_BQ", level: "block", data: { part } }];
    case "APPENDIX":
      return ctx.appendixComplete === true ? [] : [{ code: "APPENDIX_INCOMPLETE", level: "block", data: { part } }];
    case "UPLOAD":
      return p.liveUploads > 0 ? [] : [{ code: "UPLOAD_MISSING", level: "block", data: { part } }];
  }
}

/// ALREADY_READY, ALREADY_OMITTED, MANDATORY_OMITTED and OMIT_REASON_REQUIRED are no longer raised (SR-11: no Mark ready, no Omit); their words stay for the History of packs that were.
export type PartActFault = EditFault | ContentFault | "ALREADY_READY" | "ALREADY_OMITTED" | "MANDATORY_OMITTED" | "MANDATORY_UNSET" | "OMIT_REASON_REQUIRED" | "NOT_A_TEMPLATE_PART";

/**
 * SR-11 (ruling 14): what a part is, now, when its content is judged. There is no Mark ready and no Omit: a part is ready when its content is in
 * order, and an optional one with nothing to issue is "Not issued" (recorded as such at submission, NOT_ISSUED_REASON). A mandatory part whose
 * content is not in order is not ready and says what is missing.
 */
export type PartIssue =
  | { state: "READY"; as: "FILE" | "TEXT" | "FORM" | "BILL" }
  | { state: "NOT_ISSUED"; faults: Finding<ContentFault>[] }
  | { state: "NOT_READY"; faults: Finding<ContentFault>[] };

/// Review S5: the bill part where the basis needs a bill and the bill is an uploaded file. It cannot be left out: a bill-based basis with no bill at all is not a tender.
export const billPartRequired = (p: Pick<PackPartFacts, "source">, ctx: Pick<ContentContext, "billOnScreen" | "basisRequiresBq">): boolean => p.source === "BQ_UNPRICED" && ctx.billOnScreen === false && ctx.basisRequiresBq === true;

export function partIssue(p: PackPartFacts, ctx: ContentContext): PartIssue {
  const faults = partContentFaults(p, ctx);
  if (faults.length === 0) {
    if (p.source === "APPENDIX") return { state: "READY", as: "FORM" };
    if (p.source === "BQ_UNPRICED" && ctx.billOnScreen !== false) return { state: "READY", as: "BILL" };
    if (p.source === "TEMPLATE" && p.liveUploads === 0) return { state: "READY", as: "TEXT" };
    return { state: "READY", as: "FILE" };
  }
  return p.mandatory === false && !billPartRequired(p, ctx) ? { state: "NOT_ISSUED", faults } : { state: "NOT_READY", faults };
}

/// The part as submission settles it: ready, "Not issued" (omitted with that reason), or not ready (the readiness findings block it).
export function settledPart<P extends PackPartFacts>(p: P, ctx: ContentContext): P {
  const i = partIssue(p, ctx);
  if (i.state === "READY") return { ...p, state: "READY", omittedReason: "" };
  if (i.state === "NOT_ISSUED") return { ...p, state: "OMITTED", omittedReason: NOT_ISSUED_REASON };
  return { ...p, state: "NOT_STARTED", omittedReason: "" };
}

/**
 * The part as the checks after the readiness read it: settled (ready, "Not issued"), and with the source it is issued from. A merged-text part with a file is
 * issued as a file (ADR 0035), so the checks that read a template's words (the clauses, the notice's eligibility block, the validity window) treat it as an
 * uploaded part, which they already say they cannot read. The bill part is an uploaded part where the bill is not built on screen (SR-09).
 */
export function issuedPart<P extends PackPartFacts>(p: P, ctx: ContentContext): P {
  const s = settledPart(p, ctx);
  if (p.source === "TEMPLATE" && p.liveUploads > 0) return { ...s, source: "UPLOAD", template: null };
  if (p.source === "BQ_UNPRICED" && ctx.billOnScreen === false) return { ...s, source: "UPLOAD" };
  return s;
}

/// Whether the part's content is in order now, with the edit gate: what a line's note and the submit gate share (renamed from markReadyFaults, SR-11).
export function partReadyFaults(p: PackPartFacts, packStatus: TenderPackStatus, exerciseStatus: ExerciseStatus, ctx: ContentContext): Finding<PartActFault>[] {
  const edit = packEditFault(packStatus, exerciseStatus);
  if (edit) return [edit];
  return partContentFaults(p, ctx);
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

export type ReadinessFault = ContentFault | "BILL_PART_MISSING" | "PART_WAS_OMITTED" | "MANDATORY_UNSET" | "PART_NOT_READY" | "MANDATORY_OMITTED" | "OMIT_REASON_REQUIRED" | "DECLARATION_PART_MISSING" | "DECLARATION_NOT_MANDATORY" | "NO_PARTS" | "RETURN_NOT_SET";

/// Review S6: a part an officer omitted with a reason of their own, before ruling 14 removed the Omit act (the engine's own "Not issued" is not one).
export const wasOmittedByOfficer = (p: Pick<PackPartFacts, "state" | "omittedReason">): boolean => p.state === "OMITTED" && p.omittedReason.trim() !== "" && p.omittedReason !== NOT_ISSUED_REASON;

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
    // SR-11: ready is derived from the content, never from a stored state. An optional part with nothing to issue is "Not issued" and does not block.
    const issue = partIssue(p, ctx);
    if (issue.state === "NOT_READY") out.push(...issue.faults);
    // Review S6: a draft already in progress changes outcome silently otherwise. A part an officer once left out is now judged by its content, so with content in order it WILL be issued. Said at submission, with the officer's own reason, which stays visible on the line. Honouring the old omission is not offered: Omit and Reopen are gone (ruling 14), so nothing could ever reverse it.
    if (wasOmittedByOfficer(p) && issue.state === "READY") out.push({ code: "PART_WAS_OMITTED", level: "warn", data: { part, reason: p.omittedReason } });
  }
  // Phase 2 close-out 67-C1: which mandatory parts a bidder returns is frozen with the approved pack and
  // read at the opening (6.7), where an unset answer blocks finalising (CHECKLIST_NOT_JUDGED, exit:
  // cancel). Said here, before approval, while it can still be set: a warning, never a refusal (6.6
  // ruled it is not judged until the opening). The declaration is returned by definition.
  for (const p of parts) if (p.mandatory === true && !returnedByDefinition(p.role) && p.returnedByBidder == null) out.push({ code: "RETURN_NOT_SET", level: "warn", data: { part: partName(p) } });
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
  /// What the parts' content is judged by. Whether the bill is on screen is the exercise's pin, read once from `scope.onScreenBillUsed`.
  content: Omit<ContentContext, "billOnScreen" | "basisRequiresBq">;
  /// 6.2 OD-4: the scope's readiness inputs, read on locked rows.
  scope: PackInput;
  /// The Appendix, where the composition has one (a part with role APPENDIX); else null.
  appendix: AppendixFacts | null;
  /// The behaviours the exercise was decided under (its classification snapshot); null: not recorded.
  profile: readonly { key: BehaviourKey; value: BehaviourValue }[] | null;
  primeCostSums: BehaviourContext["primeCostSums"];
  /// The proposed start and closing (`approvalDatesFault`'s findings), as stored on the exercise (SR-05).
  dates: readonly Finding<DatesFault>[];
  /// SR-07: the opening officers named on the exercise (`rosterFaults`); none where it was not pinned to name them.
  officers: readonly Finding[];
  /// SR-06: the notice, fee, bid validity and briefing prepared on Scope and estimate (`noticeSubmitFaults`).
  notice: readonly Finding[];
  /// The route as it would open: its state, a refusal in words, and engine errors.
  route: { issue: boolean; state: TenderingRouteState | null; refusal: string | null; errors: readonly string[] };
  /// An Approval for Tendering route is already open on the exercise.
  routeOpen: boolean;
  /// Increment 2: eligibility, restriction, permit, clauses, assurance (`conditionsFaults`).
  conditions: ConditionsInput;
  /// The pack's kind: only a tender pack must have a Table Document (FR-DOC-010).
  packKind: PackKind;
}

export interface SubmitFindings {
  edit: Finding<EditFault>[];
  readiness: Finding<ReadinessFault>[];
  scope: Finding<PackFault>[];
  appendix: Finding<AppendixFault | "APPENDIX_NOT_STARTED">[];
  behaviour: Finding<BehaviourFault>[];
  conditions: Finding<ConditionsFault>[];
  dates: Finding<DatesFault>[];
  officers: Finding[];
  notice: Finding[];
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
  const ctx: ContentContext = { ...i.content, billOnScreen: i.scope.onScreenBillUsed, basisRequiresBq: i.scope.basis?.requiresBq ?? null };
  // SR-11: every check below that reads a part's state or source reads the part as submission settles and issues it.
  const issued = i.parts.map((p) => issuedPart(p, ctx));
  const readiness = packReadiness(i.parts, ctx);
  // SR-09: a basis let on a bill, an uploaded bill, and a pack with no part to upload it to: clearable in configuration, said here.
  if (ctx.billOnScreen === false && i.scope.basis?.requiresBq === true && !i.parts.some((p) => p.source === "BQ_UNPRICED")) readiness.push({ code: "BILL_PART_MISSING", level: "block" });
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
    readiness,
    scope: packFaults(i.scope),
    appendix: hasAppendixPart ? (i.appendix ? appendixFaults(i.appendix) : [{ code: "APPENDIX_NOT_STARTED", level: "block" }]) : [],
    behaviour: behaviourFaults(i.profile, { appendix: hasAppendixPart ? i.appendix : null, primeCostSums: i.primeCostSums, billOnScreen: ctx.billOnScreen, parts: issued }),
    conditions: conditionsFaults(issued, i.conditions, i.packKind),
    dates: [...i.dates],
    officers: [...i.officers],
    notice: [...i.notice],
    route,
  };
}

/// Every finding of a submission, flattened.
export const allOf = (s: SubmitFindings): Finding[] => [...s.edit, ...s.readiness, ...s.scope, ...s.appendix, ...s.behaviour, ...s.conditions, ...s.dates, ...s.officers, ...s.notice, ...s.route];
/// The ones that refuse it.
export const blockingOf = (s: SubmitFindings): Finding[] => allOf(s).filter((f) => f.level === "block");
